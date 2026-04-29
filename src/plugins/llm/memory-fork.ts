import { Context, Logger } from 'koishi'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  MemoryStore,
  NO_UPDATE_MAGIC,
  byteLength,
  isNoUpdateMagic,
} from './memory'
import type {
  ChatCompletionFeatures,
  ChatCompletionOptions,
  ChatMessage,
  LLMProviderBase,
} from './providers/_base'
import { clampThinkingBudget } from './thinking'

const MEMORY_FORK_PROMPT_TEMPLATE = (() => {
  try {
    return readFileSync(
      resolve(__dirname, './prompts/memory-fork.prompt.md'),
      'utf-8'
    )
  } catch {
    return ''
  }
})()

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

  // 复制原 history（去掉所有 system 角色，避免叠加），追加触发 user 消息。
  // 对每条 assistant 消息补齐 reasoning_content 字段（默认 ''）——DeepSeek
  // thinking mode 要求历史中每条 assistant 都带这个字段，否则 400 报错。
  const normalizedHistory = input.history
    .filter((m) => m.role !== 'system')
    .map((m): ChatMessage => {
      if (m.role === 'assistant' && m.reasoning_content === undefined) {
        return { ...m, reasoning_content: '' }
      }
      return m
    })
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...normalizedHistory,
    { role: 'user', content: '请基于以上对话更新记忆档案。' },
  ]

  const options: ChatCompletionOptions = {
    model: input.model,
    maxTokens: input.maxTokens,
    temperature: 0.5,
    topP: 0.9,
  }

  // memory fork 是反思任务，开 thinking 让模型先权衡再下笔
  const thinkingBudget = clampThinkingBudget(4096, input.maxTokens)
  const features: ChatCompletionFeatures = {
    enableThinking: thinkingBudget > 0,
    thinkingBudget,
  }

  for (let attempt = 1; attempt <= input.maxRetries; attempt++) {
    let collected = ''
    for await (const delta of input.provider.streamChatCompletion(
      messages,
      options,
      features
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

export function buildMemoryForkSystemPrompt(
  existingMemory: string,
  softLimit: number,
  hardLimit: number
): string {
  const tpl = MEMORY_FORK_PROMPT_TEMPLATE
  if (!tpl) {
    // 兜底：模板文件读取失败时使用最小可用提示，避免任务直接挂
    return [
      '你的任务：基于刚才的对话记录，决定是否更新用户的长期记忆。',
      `如果没有值得保留的新信息，只输出 ${NO_UPDATE_MAGIC}。`,
      `否则输出完整的新记忆内容（markdown），不超过 ${softLimit} 字节，硬上限 ${hardLimit}。`,
      '',
      '当前记忆：',
      existingMemory || '(空)',
    ].join('\n')
  }
  return tpl
    .replace(/\{\{EXISTING_MEMORY\}\}/g, existingMemory || '(空)')
    .replace(/\{\{SOFT_LIMIT\}\}/g, String(softLimit))
    .replace(/\{\{HARD_LIMIT\}\}/g, String(hardLimit))
    .replace(/\{\{NO_UPDATE_MAGIC\}\}/g, NO_UPDATE_MAGIC)
}
