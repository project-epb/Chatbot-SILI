import type { Context, Logger } from 'koishi'

import type { MemoryStore } from '../memory'
import type { LLMProviderBase } from '../providers/_base'

/**
 * Minimal provider-config shape the scheduler reads. Mirrors a subset of
 * the union type defined by PluginLLM.config.providers — kept inline here
 * (instead of importing) to avoid a cycle with index.tsx.
 */
export interface SchedulerProviderConfig {
  name: string
  type: string
  model?: string
  maxTokens?: number
}
import type { ChatHistoryService } from './chat-history'

/**
 * Subset of PluginLLM that the memory-fork scheduler needs. Defined
 * structurally so we don't have to import the plugin class (avoids a
 * cycle and keeps the scheduler decoupled from the rest of the plugin).
 */
export interface MemoryForkSchedulerDeps {
  ctx: Context
  logger: Logger
  memory: MemoryStore
  chatHistory: ChatHistoryService
  defaultProvider: LLMProviderBase
  useProvider(name: string): LLMProviderBase
  /** Read config lazily so config edits don't get cached. */
  config: {
    memoryModel?: string
    memoryUpdateInterval?: number
    memoryByteLimit?: number
    memoryForkMaxRetries?: number
    providers: SchedulerProviderConfig[]
    model?: string
    maxTokens?: number
  }
}

/**
 * Throttles + dispatches the LLM-driven memory-fork task. Bookkeeping (how
 * many user messages have arrived since the last fork) lives in the memory
 * store itself; this scheduler just decides "is it time?" and wires the
 * appropriate model/provider before calling into ./memory-fork.
 */
export class MemoryForkScheduler {
  constructor(private readonly deps: MemoryForkSchedulerDeps) {}

  /**
   * Resolve which (provider, model, maxTokens) to use for memory fork.
   * Honors `memoryModel` config (e.g. "openrouter#claude-haiku-4.5"),
   * falling back to the default provider/model.
   */
  private resolveProvider(): {
    provider: LLMProviderBase
    model: string
    maxTokens: number
  } {
    const { config, defaultProvider, useProvider, logger } = this.deps
    const defaultProviderConfig = config.providers[0]
    const fallback = () => ({
      provider: defaultProvider,
      model: defaultProviderConfig?.model || config.model || 'gpt-4o-mini',
      maxTokens:
        defaultProviderConfig?.maxTokens ?? config.maxTokens ?? 1024,
    })

    const spec = config.memoryModel?.trim()
    if (!spec) return fallback()

    const m = spec.match(/^([^#:]+)[#:](.+)$/)
    let providerName: string | undefined
    let model: string
    if (m) {
      providerName = m[1].trim()
      model = m[2].trim()
    } else {
      model = spec
    }

    const providerConfig = providerName
      ? config.providers.find((p) => p.name === providerName)
      : defaultProviderConfig

    if (providerName && !providerConfig) {
      logger.warn(
        '[memory] memoryModel provider %s not found, falling back to default',
        providerName
      )
      return fallback()
    }

    const provider = providerName
      ? useProvider(providerName)
      : defaultProvider
    const maxTokens = providerConfig?.maxTokens ?? config.maxTokens ?? 1024
    return {
      provider,
      model: model || providerConfig?.model || 'gpt-4o-mini',
      maxTokens,
    }
  }

  /**
   * Fire memory-fork if the user has accumulated enough messages since
   * last update (or unconditionally when `force: true`). Best-effort:
   * underlying memory-fork errors are swallowed by the caller's catch.
   */
  async maybeTrigger(
    args: {
      platform: string
      userId: string
      conversation_id: string
      conversation_owner: number
    },
    opts: { force?: boolean } = {}
  ): Promise<void> {
    const { ctx, logger, memory, chatHistory, config } = this.deps
    const interval = config.memoryUpdateInterval ?? 10
    const byteLimit = config.memoryByteLimit ?? 3000
    const maxRetries = config.memoryForkMaxRetries ?? 3

    const meta = await memory.getMeta(args.platform, args.userId)
    const userMessages = await ctx.database.get(
      'openai_chat',
      { conversation_owner: args.conversation_owner, role: 'user' },
      { fields: ['id'] }
    )
    const userMessageCount = userMessages?.length ?? 0
    if (!opts.force) {
      const since = userMessageCount - (meta?.message_count_at_update ?? 0)
      if (since < interval) return
    }

    // 拉取对话上下文（reasoning_content 已在 ChatHistoryService 默认带上）
    const history = await chatHistory.getById(args.conversation_id, 50)

    const { provider, model, maxTokens } = this.resolveProvider()

    const { maybeRunMemoryFork } = await import('../memory-fork')
    await maybeRunMemoryFork({
      ctx,
      logger,
      store: memory,
      provider,
      model,
      maxTokens,
      byteLimit,
      maxRetries,
      platform: args.platform,
      userId: args.userId,
      conversationId: args.conversation_id,
      currentMessageCount: userMessageCount,
      history,
    })
  }
}
