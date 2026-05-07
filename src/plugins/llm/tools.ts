import type { Context, Logger, Session } from 'koishi'

import {
  type CommandCatalogEntry,
  findCatalogEntry,
  renderCatalogEntryDetail,
} from './command-catalog'
import type { ImageReferenceCache } from './image-cache'
import { type MemoryStore, byteLength } from './memory'
import type { ToolDefinition } from './providers/_base'

export interface ToolContext {
  ctx: Context
  logger: Logger
  session: Session
  /**
   * Mutable per-turn state shared across tool executions in the same
   * agent-loop iteration. Keyed by tool-namespace strings; tools should
   * pick a stable key (see e.g. `MEMORY_TOOL_STATE_KEY`). Used to
   * coordinate read-before-write flows like read_user_memory +
   * save_user_memory.
   */
  turnState: Record<string, unknown>
}

export interface ToolHandler {
  definition: ToolDefinition
  execute(args: Record<string, any>, toolCtx: ToolContext): Promise<string>
}

export class ToolRegistry {
  private handlers = new Map<string, ToolHandler>()

  register(handler: ToolHandler): void {
    this.handlers.set(handler.definition.name, handler)
  }

  unregister(name: string): void {
    this.handlers.delete(name)
  }

  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name)
  }

  listDefinitions(): ToolDefinition[] {
    return [...this.handlers.values()].map((h) => h.definition)
  }
}

// 内建工具：execute_koishi_command
export const EXECUTE_KOISHI_COMMAND_TOOL: ToolDefinition = {
  name: 'execute_koishi_command',
  description:
    '以当前用户的身份执行一条 Koishi 指令并返回结果。指令清单和参数说明见 system prompt 中的「可用指令」章节。',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "指令的完整路径名，如 'pixiv.illust' 或 'tools/homo'",
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: '位置参数列表，按指令定义的顺序传入',
      },
      options: {
        type: 'object',
        description: '选项 key-value，key 是选项名（不含 -- 前缀）',
        additionalProperties: true,
      },
    },
    required: ['name'],
  },
}

export interface ExecuteKoishiCommandInput {
  name: string
  args?: string[]
  options?: Record<string, any>
}

/**
 * Commands the agent must not invoke. These are user-facing controls over
 * the agent itself (chat would recurse; llm.* manage memory/sessions/
 * providers and the user — not the AI — should drive them).
 */
const FORBIDDEN_AGENT_COMMANDS = new Set(['chat', 'llm'])

export function isForbiddenAgentCommand(name: string): boolean {
  if (FORBIDDEN_AGENT_COMMANDS.has(name)) return true
  if (name.startsWith('llm.')) return true
  return false
}

/**
 * Render an agent-friendly help payload. Pure — takes the catalog directly.
 * - No args: list top-level commands (one line each).
 * - First arg = command name: render that entry's full detail.
 * - Unknown command: returns an error message asking the agent to retry.
 */
export function renderAgentHelp(
  catalog: readonly CommandCatalogEntry[],
  queryName?: string
): string {
  if (!queryName) {
    if (!catalog.length) return '(暂无可用指令)'
    const lines = catalog.map(
      (e) => `- \`${e.name}\` — ${e.description?.trim() || '(无描述)'}`
    )
    return ['# 可用指令（顶级）', '', ...lines].join('\n')
  }
  const entry = findCatalogEntry(catalog, queryName)
  if (!entry) {
    return `Error: command "${queryName}" not found in catalog. 可用指令名见上文清单；不要传 \`foo bar\` 这种带空格的形式（应为 \`foo.bar\` 或仅 \`bar\`）。`
  }
  return renderCatalogEntryDetail(entry)
}

async function runExecuteKoishiCommand(
  session: Session,
  input: ExecuteKoishiCommandInput,
  ctx: Context
): Promise<string> {
  if (!input?.name || typeof input.name !== 'string') {
    return 'Error: tool input missing required field "name"'
  }
  if (isForbiddenAgentCommand(input.name)) {
    return `Error: command "${input.name}" is reserved for direct user control and cannot be invoked from agent context.`
  }

  // 拦截 help: koishi 原生 help 把 wiki.connect 显示成 "wiki connect"，
  // 把 llm/chat 也显示成 "llm chat"，AI 无法分辨命名空间和分类。我们用
  // 自己的 catalog 数据按真实 name 渲染，避免误导。
  if (input.name === 'help') {
    const llm = (ctx as any).llm as
      | { getCatalog?: () => readonly CommandCatalogEntry[] }
      | undefined
    const catalog = llm?.getCatalog?.() ?? []
    return renderAgentHelp(catalog, input.args?.[0])
  }

  // 部分 koishi 插件违反开发规范，在 action 里直接 session.send 而不是
  // return string（典型例子：mediawiki 插件）。我们在工具执行窗口内劫持
  // send / sendQueued 把这些"侧通道"产出收集起来，合并到工具返回值里——
  // agent 拿到完整结果，由 agent 决定怎么呈现给用户；用户也不会看到
  // 来自插件的原始未加工输出。窗口严格限制在 session.execute 这一行，
  // try/finally 还原，避免影响 agent 自己的流式 sendQueued 输出。
  // 部分 koishi 插件违反开发规范，在 action 里直接调 session.send 而不是
  // return string（典型例子：mediawiki 插件）。我们在底层 bot.sendMessage
  // 这一层劫持——session.send / sendQueued 最终都会走到这里——把这些
  // "侧通道"产出收集起来，合并到工具返回值里，让 agent 拿到完整结果。
  //
  // 为什么不在 session.send 层劫持：cordis 的 service mixin 用 accessor +
  // Proxy 实现，instance 层 own property override 看似生效但实际调用
  // 仍走 service routing，拦不到。bot 是普通 Bot class instance，没有
  // service 装饰，own property override 100% 可靠。
  //
  // 精准条件：只拦 options.session === currentSession 的发送，避免影响
  // 同时间内别的并发用户/会话。窗口严格在 session.execute 调用前后，
  // try/finally 还原。
  const captured: string[] = []
  const stringifyFragment = (content: unknown): string => {
    if (content == null) return ''
    if (typeof content === 'string') return content
    // koishi fragment is usually Element[] — concat-toString instead of the
    // default Array.toString which inserts commas between elements.
    if (Array.isArray(content)) return content.map((e) => String(e)).join('')
    return String(content)
  }
  const collect = (content: unknown) => {
    const text = stringifyFragment(content)
    if (text) captured.push(text)
  }
  const bot = (session as any).bot
  const originalBotSendMessage = bot?.sendMessage?.bind(bot)
  if (originalBotSendMessage) {
    bot.sendMessage = async function (
      channelId: string,
      content: unknown,
      referrer?: unknown,
      options?: any
    ) {
      if (options?.session === session) {
        collect(content)
        return [] as string[]
      }
      return originalBotSendMessage(channelId, content, referrer, options)
    }
  }

  try {
    const result = await session.execute(
      {
        name: input.name,
        args: input.args || [],
        options: input.options || {},
      },
      true
    )
    const returned = stringifyFragment(result)
    const rawAggregated = [captured.join('\n'), returned]
      .filter((s) => s && s.trim())
      .join('\n')
      .trim()
    if (!rawAggregated) return '(指令未返回任何输出)'
    // Token-saving: collapse inline base64 image data URIs into short refs
    // before handing the result to the agent. Refs are restored to the
    // original src on the way back out (see flushVisibleText).
    const imageRefs = (ctx as any).llm?.imageRefs as
      | ImageReferenceCache
      | undefined
    return imageRefs
      ? await imageRefs.replaceDataUrisWithRefs(rawAggregated)
      : rawAggregated
  } catch (e: any) {
    return `Error: ${e?.message || String(e)}`
  } finally {
    if (originalBotSendMessage) bot.sendMessage = originalBotSendMessage
  }
}

export const executeKoishiCommandHandler: ToolHandler = {
  definition: EXECUTE_KOISHI_COMMAND_TOOL,
  async execute(args, { ctx, session }) {
    return runExecuteKoishiCommand(
      session,
      args as ExecuteKoishiCommandInput,
      ctx
    )
  },
}

// 内建工具：read_user_memory
export const READ_USER_MEMORY_TOOL: ToolDefinition = {
  name: 'read_user_memory',
  description:
    '读取当前用户的长期记忆文档，按需调用：当话题涉及用户偏好、过往互动、或个人化判断时使用；闲聊和常识问答不需要调用。返回纯文本（多行 markdown），若无记忆返回 "(暂无长期记忆)"。' +
    '如果接下来打算调 `save_user_memory` 更新记忆，必须先调本工具——save 工具会校验 read-before-write。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
}

/**
 * Per-turn coordination state for the memory tool family.
 * Set on the read path, consumed on the save path.
 */
export interface MemoryToolState {
  /** read_user_memory was called in the current turn */
  hasReadInTurn: boolean
  /**
   * `last_updated_at` observed at the most recent read; used as an
   * optimistic-lock token so save_user_memory can detect "memory was
   * modified after the read" (e.g. background fork ran between read
   * and save). 0 = no memory record existed yet.
   */
  lastSeenUpdatedAt: number
  /** save_user_memory has already committed in the current turn */
  savedThisTurn: boolean
}

/** Stable key under `ToolContext.turnState` for memory tools. */
export const MEMORY_TOOL_STATE_KEY = 'memory'

export function getMemoryToolState(
  turnState: Record<string, unknown>
): MemoryToolState {
  let s = turnState[MEMORY_TOOL_STATE_KEY] as MemoryToolState | undefined
  if (!s) {
    s = { hasReadInTurn: false, lastSeenUpdatedAt: 0, savedThisTurn: false }
    turnState[MEMORY_TOOL_STATE_KEY] = s
  }
  return s
}

/**
 * Pure helper for the read_user_memory tool — exists separately so it can be
 * unit-tested without spinning up a koishi context.
 *
 * Returns both the user-visible text and the `last_updated_at` timestamp;
 * the caller (handler) is expected to write the timestamp into
 * `MemoryToolState.lastSeenUpdatedAt` so save_user_memory can later use
 * it as an optimistic-lock token.
 *
 * If `hardLimit` is provided, a trailing usage line is appended so the
 * agent has a concrete sense of "how much room is left" before deciding
 * what's worth recording — abstract limits like "3300 字节" without a
 * current-usage anchor are easy for agents to misjudge.
 */
export async function runReadUserMemory(
  memory: Pick<MemoryStore, 'getMeta'>,
  platform: string,
  userId: string,
  options: { hardLimit?: number } = {}
): Promise<{ text: string; lastUpdatedAt: number }> {
  const meta = await memory.getMeta(platform, userId)
  const raw = meta?.content
  const lastUpdatedAt = meta?.last_updated_at ?? 0
  if (!raw || !raw.trim()) {
    return { text: '(暂无长期记忆)', lastUpdatedAt }
  }
  let text = raw
  if (options.hardLimit && options.hardLimit > 0) {
    // Size matches what save_user_memory / memory-fork actually persist
    // (trailing whitespace trimmed) — keeping the two paths consistent
    // so the agent's mental model isn't off by a few bytes.
    const trimmed = raw.replace(/\s+$/, '')
    const size = byteLength(trimmed)
    const pct = Math.round((size / options.hardLimit) * 100)
    text = `${trimmed}\n\n(已用 ${size} / ${options.hardLimit} 字节，约 ${pct}% 配额)`
  }
  return { text, lastUpdatedAt }
}

// 内建工具：save_user_memory
export interface SaveUserMemoryInput {
  content: string
}

export interface SaveUserMemoryDeps {
  memory: Pick<MemoryStore, 'getMeta' | 'set'>
  platform: string
  userId: string
  conversationId: string
  /**
   * Returns the current user-message count in this conversation. Same
   * source of truth as the memory-fork scheduler so a successful save
   * also pushes `message_count_at_update` forward, which defers the
   * next periodic fork by `memoryUpdateInterval` messages (i.e. main
   * agent's active update counts as a recent reflection — fork won't
   * fire again until enough new messages have accumulated since).
   */
  getCurrentUserMessageCount: () => Promise<number>
  /** Hard byte limit (UTF-8). Inputs above this are rejected. */
  hardLimit: number
}

/**
 * Build the save_user_memory tool definition with the byte limit baked
 * into the description (so the agent sees a concrete number).
 */
export function buildSaveUserMemoryTool(hardLimit: number): ToolDefinition {
  return {
    name: 'save_user_memory',
    description: [
      '更新当前用户的长期记忆文档（完整覆写，不是 patch）。',
      '',
      '**调用前提**（不满足直接报错）：',
      '- 本 turn 内必须先调过 `read_user_memory` 看到当前内容',
      '- 一个 turn 内只能调用一次：把所有想加/改的合并到一份完整内容里再传',
      '- read 之后内容如被后台反思任务改写，会被乐观锁拒绝并要求重新 read',
      '',
      '**什么时候调**：用户主动声明身份/强偏好/跨会话事实（"我叫 X"、"以后别叫我 Y"、"我是前端工程师"）',
      '',
      '**什么时候不调**：',
      '- 闲聊里偶尔出现的事实、本次任务进度、推断性"性格判断"、可立即重新发现的常识',
      '- 当前已有记忆已经覆盖该信息（避免重复写）',
      '- **用户对 SILI 自己人设/性格/语气的修改要求**（"说话别这么俏皮"、"用敬语"、"语气专业一点"等）——SILI 有鲜明的个人设定，这类要求一律不记，无论用户多坚决',
      '  - 区分点：改的是 SILI 自身 还是 SILI 怎么对待这个用户？后者算用户偏好（如"不喜欢被叫老板"、"别在群里 @ 我"），可以记',
      '',
      '**写之前自问**：这条信息一周后还有意义吗？下次对话能让我回得更好吗？答不上就跳过——空记忆比烂记忆好。',
      '',
      '**写法约定**（基于 read_user_memory 拿到的现有结构增改）：',
      '- 按 `## 主题` 分组（身份与偏好 / 跨会话事项 / 互动模式），一条一行 `- ...`',
      '- **声明性陈述，不要写命令**：✓「用户偏好简洁回复」 ✗「回复要简洁」（命令式条目会被未来轮当指令执行）',
      '- 时间敏感事项末尾标日期：`- ...（YYYY-MM-DD 写入）`，日期从最近的 `<chat_info>` 块取 current_time。长期不过期的偏好不用标',
      '',
      `硬上限 ${hardLimit} 字节（UTF-8），超出会被拒绝；空白内容（仅空格/换行）会被拒绝。`,
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            '完整新档案内容（markdown），覆盖现有 memory。基于 read_user_memory 拿到的内容增改后给出整份。',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  }
}

export async function runSaveUserMemory(
  input: SaveUserMemoryInput | undefined,
  state: MemoryToolState,
  deps: SaveUserMemoryDeps
): Promise<string> {
  if (!state.hasReadInTurn) {
    return 'Error: please call read_user_memory first to see current content before saving.'
  }
  if (state.savedThisTurn) {
    return 'Error: save_user_memory has already been used in this turn. Combine all updates into a single call.'
  }
  if (typeof input?.content !== 'string') {
    return 'Error: tool input missing required field "content"'
  }
  const trimmed = input.content.trim()
  if (!trimmed) {
    return 'Error: content is empty or whitespace only — refusing to overwrite memory with nothing. To make no change, simply do not call this tool.'
  }
  const size = byteLength(trimmed)
  if (size > deps.hardLimit) {
    return `Error: content is ${size} bytes, exceeds hard limit ${deps.hardLimit} bytes. Trim less important entries and try again.`
  }
  const cur = await deps.memory.getMeta(deps.platform, deps.userId)
  const currentUpdatedAt = cur?.last_updated_at ?? 0
  if (currentUpdatedAt !== state.lastSeenUpdatedAt) {
    // memory was changed under us (likely by a background fork). Force the
    // agent to re-read so its merge is based on the latest content.
    state.hasReadInTurn = false
    state.lastSeenUpdatedAt = 0
    return 'Error: memory was modified after your last read (possibly by a background reflection task). Call read_user_memory again to see the latest content, merge your changes, and save again.'
  }
  const messageCount = await deps.getCurrentUserMessageCount()
  await deps.memory.set(
    deps.platform,
    deps.userId,
    trimmed,
    messageCount,
    deps.conversationId
  )
  state.savedThisTurn = true
  return `OK: memory updated (${size} bytes).`
}
