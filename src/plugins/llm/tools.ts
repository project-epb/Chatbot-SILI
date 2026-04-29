import type { Context, Logger, Session } from 'koishi'

import {
  type CommandCatalogEntry,
  findCatalogEntry,
  renderCatalogEntryDetail,
} from './command-catalog'
import type { ToolDefinition } from './providers/_base'

export interface ToolContext {
  ctx: Context
  logger: Logger
  session: Session
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

  try {
    const result = await session.execute(
      {
        name: input.name,
        args: input.args || [],
        options: input.options || {},
      },
      true
    )
    if (typeof result === 'string') return result || '(指令未返回任何输出)'
    return result == null ? '(指令未返回任何输出)' : String(result)
  } catch (e: any) {
    return `Error: ${e?.message || String(e)}`
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
