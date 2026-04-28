import { Context, Logger } from 'koishi'

import { MemoryStore, NO_UPDATE_MAGIC, isNoUpdateMagic } from './memory'
import type {
  ChatCompletionOptions,
  ChatMessage,
  LLMProviderBase,
} from './providers/_base'

export interface MemoryForkInput {
  ctx: Context
  logger: Logger
  store: MemoryStore
  provider: LLMProviderBase
  model: string
  maxTokens: number
  byteLimit: number
  platform: string
  userId: string
  conversationId: string
  currentMessageCount: number
  history: ChatMessage[]
}

const MEMORY_FORK_LOCKS = new Set<string>()

function lockKey(platform: string, userId: string): string {
  return `${platform}:${userId}`
}

export function isForkInProgress(platform: string, userId: string): boolean {
  return MEMORY_FORK_LOCKS.has(lockKey(platform, userId))
}

export async function maybeRunMemoryFork(
  input: MemoryForkInput
): Promise<void> {
  const key = lockKey(input.platform, input.userId)
  if (MEMORY_FORK_LOCKS.has(key)) return
  MEMORY_FORK_LOCKS.add(key)
  try {
    await runMemoryFork(input)
  } catch (e) {
    input.logger.warn('[memory-fork] failed:', e)
  } finally {
    MEMORY_FORK_LOCKS.delete(key)
  }
}

async function runMemoryFork(input: MemoryForkInput): Promise<void> {
  const existingMemory = await input.store.get(input.platform, input.userId)

  const systemPrompt = buildMemoryForkSystemPrompt(
    existingMemory,
    input.byteLimit
  )

  // 复制原 history（去掉所有 system 角色，避免叠加），追加触发 user 消息
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...input.history.filter((m) => m.role !== 'system'),
    { role: 'user', content: '请基于以上对话更新记忆档案。' },
  ]

  const options: ChatCompletionOptions = {
    model: input.model,
    maxTokens: input.maxTokens,
    temperature: 0.5,
    topP: 0.9,
  }

  // 完整收集流式输出
  let collected = ''
  for await (const delta of input.provider.streamChatCompletion(
    messages,
    options
  )) {
    if (delta.kind === 'content') collected += delta.content
    if (delta.kind === 'error') throw delta.error
  }

  const trimmed = collected.trim()
  input.logger.info(
    '[memory-fork] result for %s:%s, %d bytes',
    input.platform,
    input.userId,
    trimmed.length
  )

  if (!trimmed) {
    input.logger.warn('[memory-fork] empty output, treating as no-update')
    await input.store.markChecked(
      input.platform,
      input.userId,
      input.currentMessageCount
    )
    return
  }

  if (isNoUpdateMagic(trimmed)) {
    await input.store.markChecked(
      input.platform,
      input.userId,
      input.currentMessageCount
    )
    return
  }

  await input.store.set(
    input.platform,
    input.userId,
    trimmed,
    input.byteLimit,
    input.currentMessageCount
  )
}

function buildMemoryForkSystemPrompt(
  existingMemory: string,
  byteLimit: number
): string {
  return [
    '你的任务：基于用户的对话记录，更新其个人记忆档案。',
    '',
    '【当前记忆档案】',
    existingMemory || '(空)',
    '',
    '【输出规则】',
    `1. 容量上限：${byteLimit} 字节`,
    '2. 只保留对未来对话有价值的信息：',
    '   - 用户画像（昵称、身份、长期偏好）',
    '   - 重要事项（正在进行的事、未解决的话题）',
    '   - 互动模式（用户的沟通习惯、雷区）',
    '3. 不重要的细节让它自然遗忘——容量是硬约束，必须取舍',
    `4. 如果对话相比当前记忆没有任何值得保留的新增信息，**只输出魔法值** ${NO_UPDATE_MAGIC}，不要输出其他任何字符`,
    '5. 否则直接输出完整的新记忆内容（markdown 格式），不要包裹代码块、不要解释、不要前后缀',
  ].join('\n')
}
