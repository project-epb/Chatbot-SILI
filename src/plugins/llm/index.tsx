/**
 * AI Chat Plugin - make chat bot great again!
 * @author dragon-fish
 * @license MIT
 */
import { Context } from 'koishi'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import BasePlugin from '~/_boilerplate'

import type { ClientOptions as AnthropicClientOptions } from '@anthropic-ai/sdk'
import { Inject } from 'cordis'
import type { ClientOptions } from 'openai'

import { type CommandCatalogEntry } from './command-catalog'
import AdminCommands from './commands/admin'
import ChatCommand from './commands/chat'
import { ImageReferenceCache } from './image-cache'
import { MemoryStore } from './memory'
import { ChatCompletionUsage, LLMProviderBase } from './providers/_base'
import { AnthropicProvider } from './providers/anthropic'
import { OpenAIProvider } from './providers/openai'
import { SessionManager } from './session-manager'
import { ActiveChatRegistry } from './services/active-chats'
import { ChatHistoryService } from './services/chat-history'
import { CommandCatalogService } from './services/command-catalog'
import { MemoryForkScheduler } from './services/memory-fork-scheduler'
import { SystemPromptBuilder } from './services/system-prompt'
import {
  READ_USER_MEMORY_TOOL,
  ToolRegistry,
  buildSaveUserMemoryTool,
  executeKoishiCommandHandler,
  getMemoryToolState,
  runReadUserMemory,
  runSaveUserMemory,
} from './tools'

declare module 'koishi' {
  export interface Tables {
    openai_chat: OpenAIConversationLog
  }
  export interface User {
    openai_last_conversation_id: string
  }
  interface Context {
    llm: PluginLLM
  }
}

interface OpenAIConversationLog {
  id: number
  conversation_id: string
  conversation_owner: number
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoning_content: string
  tool_calls?: string // JSON 序列化的 ToolCall[]
  tool_call_id?: string // tool 角色填
  tool_name?: string // tool 角色填，便于日志
  usage?: ChatCompletionUsage
  model?: string
  time: number
}

export type ProviderConfig =
  | {
      name: string
      type: 'openai'
      options: ClientOptions
      model?: string
      maxTokens?: number
    }
  | {
      name: string
      type: 'anthropic'
      options: AnthropicClientOptions
      model?: string
      maxTokens?: number
    }

export interface Config {
  providers: ProviderConfig[]
  model?: string
  /**
   * 单次拉多少 user turn 进 prompt。一个 turn = 1 user + 0..N
   * assistant(tool_calls) + 0..N tool result + 1 final assistant，整 turn
   * 完整入选，不会被截断到中间。落到实际 ChatMessage 行数会比这个数大
   * （工具调用越密越大），但 IM 场景一般就 1.5-3 倍。
   */
  historyTurnCount?: number
  maxTokens?: number
  systemPrompt?: Partial<{
    default: string
    [key: string]: string
  }>
  modelAliases?: Record<string, string>

  // Agent 改造新增
  enableAgent?: boolean
  maxToolIterations?: number
  showToolCallNotice?: boolean
  memoryByteLimit?: number
  memoryUpdateInterval?: number
  memoryForkMaxRetries?: number
  /**
   * Idle timeout (ms) for a chat session. After this many ms without a new
   * user message, the next message rotates to a fresh conversation_id —
   * primarily a length cap on chat history, since system prompt is now
   * derived per-process and no longer frozen per-session. 0 disables expiry.
   */
  sessionIdleTimeoutMs?: number
  /**
   * Override the model used for memory fork tasks (e.g. summarisation).
   * Format: "providerName:modelName" or "providerName#modelName" or just "modelName".
   * If unset or unresolvable, falls back to the default provider/model.
   */
  memoryModel?: string
  /** Total disk usage cap for the inline-image cache (bytes). Default 500MB. */
  imageCacheMaxBytes?: number
  /** Per-file TTL for the inline-image cache (ms). Default 4h. */
  imageCacheTtlMs?: number
  /** Max bytes per image; oversized images skip cache + show placeholder. Default 8MB. */
  imageCacheMaxImageBytes?: number
}
export declare const Config: Config

export default class PluginLLM extends BasePlugin<Config> {
  static inject: Inject = {
    database: { required: true },
    html: { required: false },
  }

  readonly providers: Map<string, LLMProviderBase> = new Map()

  get defaultProvider(): LLMProviderBase {
    const first = this.providers.values().next().value
    if (!first) throw new Error('No LLM provider configured')
    return first
  }

  useProvider(name: string): LLMProviderBase {
    const p = this.providers.get(name)
    if (!p) throw new Error(`LLM provider "${name}" not found`)
    return p
  }

  readonly MODEL_ALIASES: Record<string, string> = {}
  readonly memory: MemoryStore = new MemoryStore(this.ctx)
  readonly sessions: SessionManager = new SessionManager(this.ctx)
  readonly tools: ToolRegistry = new ToolRegistry()
  readonly imageRefs: ImageReferenceCache = new ImageReferenceCache({
    dir: resolve(this.ctx.baseDir, 'data', 'llm', 'image-cache'),
    maxBytes: this.config.imageCacheMaxBytes,
    ttlMs: this.config.imageCacheTtlMs,
    maxImageBytes: this.config.imageCacheMaxImageBytes,
  })
  readonly systemPrompt: SystemPromptBuilder = new SystemPromptBuilder(
    () => this.config.systemPrompt.default ?? ''
  )
  readonly chatHistory: ChatHistoryService = new ChatHistoryService(this.ctx)
  readonly activeChats: ActiveChatRegistry = new ActiveChatRegistry(this.logger)
  readonly catalog: CommandCatalogService = new CommandCatalogService(
    this.ctx,
    this.logger
  )
  readonly memoryFork: MemoryForkScheduler = new MemoryForkScheduler(this)

  constructor(ctx: Context, config: Config) {
    // One-time compat: 旧字段名 historyMessageCount → historyTurnCount。
    // 单位语义不变（一直是 user turn 数）；仅改名以避免误导成"消息行数"。
    // 读完即丢，下游代码统一只看 historyTurnCount。
    const legacy = (config as any).historyMessageCount
    let migratedFromLegacyName = false
    if (legacy !== undefined && config.historyTurnCount === undefined) {
      config.historyTurnCount = legacy
      migratedFromLegacyName = true
    }
    if ('historyMessageCount' in (config as any)) {
      delete (config as any).historyMessageCount
    }

    const defaultConfigs: Partial<Config> = {
      model: 'gpt-4o-mini',
      maxTokens: 8192,
      historyTurnCount: 10,
      enableAgent: true,
      maxToolIterations: 5,
      showToolCallNotice: true,
      memoryByteLimit: 3000,
      memoryUpdateInterval: 10,
      memoryForkMaxRetries: 3,
      sessionIdleTimeoutMs: 3 * 24 * 60 * 60 * 1000, // 3 days
      systemPrompt: {
        default: PluginLLM.readPromptFile('SILI-v5.prompt.md'),
      },
    }
    config = {
      ...defaultConfigs,
      ...config,
      systemPrompt: {
        ...defaultConfigs.systemPrompt,
        ...config.systemPrompt,
      },
    }
    super(ctx, config, 'llm')

    if (migratedFromLegacyName) {
      this.logger.warn(
        '[config] "historyMessageCount" is deprecated; rename to "historyTurnCount" (semantics unchanged — counts user turns, not raw message rows).'
      )
    }

    for (const providerConfig of config.providers) {
      switch (providerConfig.type) {
        case 'openai':
          this.providers.set(
            providerConfig.name,
            new OpenAIProvider(providerConfig.options)
          )
          break
        case 'anthropic':
          this.providers.set(
            providerConfig.name,
            new AnthropicProvider(providerConfig.options)
          )
          break
        default:
          this.logger.warn(
            `Unknown provider type: ${(providerConfig as any).type}`
          )
      }
    }

    this.#initDatabase()
    // 顶层命令（仅声明 namespace，子命令由子插件注册）
    ctx.command('llm', 'Make ChatBot Great Again')
    // 子插件：每个负责一组命令，随父插件 dispose 自动卸载。
    ctx.plugin(AdminCommands)
    ctx.plugin(ChatCommand)
    if (config.modelAliases) {
      this.MODEL_ALIASES = config.modelAliases
    }

    // 注册内建工具
    this.tools.register(executeKoishiCommandHandler)
    this.tools.register({
      definition: READ_USER_MEMORY_TOOL,
      execute: async (_args, { session, turnState }) => {
        const { platform, userId } = this.resolveMemoryKey(session)
        const result = await runReadUserMemory(this.memory, platform, userId, {
          hardLimit: this.getMemoryHardLimit(),
        })
        const state = getMemoryToolState(turnState)
        state.hasReadInTurn = true
        state.lastSeenUpdatedAt = result.lastUpdatedAt
        return result.text
      },
    })
    this.tools.register({
      definition: buildSaveUserMemoryTool(this.getMemoryHardLimit()),
      execute: async (args, { ctx, session, turnState }) => {
        const { platform, userId } = this.resolveMemoryKey(session)
        const conversationId =
          (session.user as any)?.openai_last_conversation_id ?? ''
        if (!conversationId) {
          return 'Error: no active conversation. Skip this turn and try again on the next user message.'
        }
        const conversationOwner = (session.user as any)?.id ?? 0
        const state = getMemoryToolState(turnState)
        return runSaveUserMemory(args as any, state, {
          memory: this.memory,
          platform,
          userId,
          conversationId,
          getCurrentUserMessageCount: async () => {
            const rows = await ctx.database.get(
              'openai_chat',
              {
                conversation_owner: conversationOwner,
                conversation_id: conversationId,
                role: 'user',
              },
              { fields: ['id'] }
            )
            return rows?.length ?? 0
          },
          hardLimit: this.getMemoryHardLimit(),
        })
      },
    })

    // catalog 自己挂 ready hook，rebuild 时机一致；之后每次 chat turn
    // getOrRefresh 会按需懒重建（覆盖 ready 后才 register 的延迟插件）
    this.catalog.bind()
    this.ctx.on('ready', () => {
      // 启动时清一次过期的图片缓存；之后每小时再扫一次（ctx.setInterval
      // 在 plugin dispose 时自动清理）。
      this.imageRefs
        .cleanup()
        .then((r) =>
          this.logger.info(
            '[image-cache] startup cleanup: removed=%d kept=%d totalBytes=%d',
            r.removed,
            r.kept,
            r.totalBytes
          )
        )
        .catch((e) =>
          this.logger.warn('[image-cache] startup cleanup failed:', e)
        )
      this.ctx.setInterval(
        () => {
          this.imageRefs
            .cleanup()
            .catch((e) =>
              this.logger.warn('[image-cache] periodic cleanup failed:', e)
            )
        },
        60 * 60 * 1000
      )
    })

    this.ctx.set('llm', this)
  }

  async #initDatabase() {
    this.ctx.model.extend('user', {
      openai_last_conversation_id: 'string',
    })
    this.ctx.model.extend(
      'openai_chat',
      {
        id: 'integer',
        conversation_id: 'string',
        conversation_owner: 'integer',
        role: 'string',
        content: 'text',
        reasoning_content: 'text',
        tool_calls: 'text',
        tool_call_id: 'string',
        tool_name: 'string',
        usage: 'json',
        model: 'string',
        time: 'integer',
      },
      {
        primary: 'id',
        autoInc: true,
        indexes: [
          // ChatHistoryService.getById
          ['conversation_id', 'time'],
          // 通过用户查找记录
          ['conversation_owner', 'time'],
          // 用于可能的时间范围清理操作
          ['time'],
        ],
      }
    )
    MemoryStore.initSchema(this.ctx)
    SessionManager.initSchema(this.ctx)
  }


  static readPromptFile(file: string) {
    try {
      return readFileSync(resolve(__dirname, `./prompts/${file}`), {
        encoding: 'utf-8',
      })
        .toString()
        .trim()
    } catch (e) {
      return ''
    }
  }

  /**
   * Resolve the (platform, userId) pair the memory store keys on for a session.
   * Same logic as the chat action — keep them in sync. Public so subplugins
   * (commands/admin, commands/chat) can use it via ctx.llm.
   */
  resolveMemoryKey(session: any): { platform: string; userId: string } {
    const platform =
      session.platform === 'onebot' ? 'qq' : session.platform || 'unknown'
    const userId = session.user?.id?.toString() || session.userId || 'anonymous'
    return { platform, userId }
  }

  /** Public read access to the cached agent command catalog (for tools.ts). */
  getCatalog(): readonly CommandCatalogEntry[] {
    return this.catalog.list()
  }

  /**
   * Hard byte limit for memory writes (both fork and the save_user_memory
   * tool). Mirrors the soft-limit + 10% policy used in memory-fork.ts.
   */
  private getMemoryHardLimit(): number {
    const soft = this.config.memoryByteLimit ?? 3000
    return Math.ceil(soft * 1.1)
  }
}
