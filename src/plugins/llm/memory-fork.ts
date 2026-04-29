import { Context, Logger } from 'koishi'

import {
  MemoryStore,
  NO_UPDATE_MAGIC,
  byteLength,
  isNoUpdateMagic,
} from './memory'
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
  /** Soft byte limit for the memory document. Hard limit = ceil(softLimit * 1.1). */
  byteLimit: number
  /** Maximum retries when the model output exceeds the hard limit. */
  maxRetries: number
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
  const softLimit = input.byteLimit
  const hardLimit = Math.ceil(softLimit * 1.1)

  const systemPrompt = buildMemoryForkSystemPrompt(
    existingMemory,
    softLimit,
    hardLimit
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

  for (let attempt = 1; attempt <= input.maxRetries; attempt++) {
    let collected = ''
    for await (const delta of input.provider.streamChatCompletion(
      messages,
      options
    )) {
      if (delta.kind === 'content') collected += delta.content
      if (delta.kind === 'error') throw delta.error
    }
    const trimmed = collected.trim()
    const size = byteLength(trimmed)

    input.logger.info(
      '[memory-fork] %s:%s attempt %d/%d, %d bytes',
      input.platform,
      input.userId,
      attempt,
      input.maxRetries,
      size
    )

    if (!trimmed) {
      input.logger.warn('[memory-fork] empty output (attempt %d)', attempt)
      messages.push({ role: 'assistant', content: collected })
      messages.push({
        role: 'user',
        content:
          '上次输出为空。请重新生成。如果确实没有值得记录的内容，' +
          `只输出魔法值 ${NO_UPDATE_MAGIC}。`,
      })
      continue
    }

    if (isNoUpdateMagic(trimmed)) {
      await input.store.markChecked(
        input.platform,
        input.userId,
        input.currentMessageCount
      )
      return
    }

    if (size > hardLimit) {
      input.logger.warn(
        '[memory-fork] output %d bytes exceeds hard limit %d (attempt %d)',
        size,
        hardLimit,
        attempt
      )
      messages.push({ role: 'assistant', content: trimmed })
      messages.push({
        role: 'user',
        content:
          `上次输出 ${size} 字节，超过硬上限 ${hardLimit} 字节，已被拒绝。` +
          '必须更激进地遗忘不重要的内容，重新生成。' +
          `如果重新评估后觉得没有值得记录的，可以只输出 ${NO_UPDATE_MAGIC}。`,
      })
      continue
    }

    // 软限内或软-硬限之间，都接受
    if (size > softLimit) {
      input.logger.warn(
        '[memory-fork] output %d bytes over soft limit %d (within %d hard tolerance)',
        size,
        softLimit,
        hardLimit
      )
    }
    await input.store.set(
      input.platform,
      input.userId,
      trimmed,
      input.currentMessageCount
    )
    return
  }

  // 重试用尽
  input.logger.warn(
    '[memory-fork] %s:%s exhausted %d retries, marking checked without update',
    input.platform,
    input.userId,
    input.maxRetries
  )
  await input.store.markChecked(
    input.platform,
    input.userId,
    input.currentMessageCount
  )
}

function buildMemoryForkSystemPrompt(
  existingMemory: string,
  softLimit: number,
  hardLimit: number
): string {
  return [
    '你的任务：基于用户的对话记录，更新其个人记忆档案。',
    '',
    '【当前记忆档案】',
    existingMemory || '(空)',
    '',
    '【容量规则】',
    `- 目标长度：${softLimit} 字节以内（UTF-8）`,
    `- 硬上限：${hardLimit} 字节（超出会被拒绝并要求重写）`,
    '- 容量是硬约束。当对话信息量超出预算，必须主动遗忘不重要的内容——',
    '  只保留会影响未来对话方向、或长期有意义的事实',
    '- 不要让记忆无限增殖',
    '',
    '【保留什么】',
    '- 用户画像（昵称、身份、长期偏好）',
    '- 重要事项（正在进行的事、未解决的话题）',
    '- 互动模式（用户的沟通习惯、雷区）',
    '',
    '【输出规则】',
    `1. 如果对话相比当前记忆没有任何值得保留的新增信息，**只输出魔法值** ${NO_UPDATE_MAGIC}，不要输出其他任何字符`,
    '2. 否则直接输出完整的新记忆内容（markdown 格式），不要包裹代码块、不要解释、不要前后缀',
  ].join('\n')
}
