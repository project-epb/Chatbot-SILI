import type { Context, Logger, Session } from 'koishi'

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

async function runExecuteKoishiCommand(
  session: Session,
  input: ExecuteKoishiCommandInput
): Promise<string> {
  if (!input?.name || typeof input.name !== 'string') {
    return 'Error: tool input missing required field "name"'
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
  async execute(args, { session }) {
    return runExecuteKoishiCommand(session, args as ExecuteKoishiCommandInput)
  },
}
