import { Context } from 'koishi'

import { isForbiddenAgentCommand } from './tools'

export interface CommandCatalogArg {
  name: string
  type: string
  required: boolean
  description?: string
}

export interface CommandCatalogOption {
  name: string
  type: string
  description?: string
}

export interface CommandCatalogEntry {
  name: string
  description: string
  args: CommandCatalogArg[]
  options: CommandCatalogOption[]
  aliases: string[]
  children: CommandCatalogEntry[]
}

function renderEntry(entry: CommandCatalogEntry, indent: number): string {
  const pad = ' '.repeat(indent * 2)
  const argSig = entry.args
    .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`))
    .join(' ')
  const head = [entry.name, argSig].filter(Boolean).join(' ')
  const lines: string[] = []
  lines.push(`${pad}${head} — ${entry.description}`)

  if (entry.args.length) {
    const argDescs = entry.args
      .map((a) =>
        `${a.name}(${a.type}${a.description ? ', ' + a.description : ''})`
      )
      .join(', ')
    lines.push(`${pad}  参数: ${argDescs}`)
  }

  if (entry.options.length) {
    const optDescs = entry.options
      .map((o) =>
        `--${o.name}${o.description ? '(' + o.description + ')' : ''}`
      )
      .join(', ')
    lines.push(`${pad}  选项: ${optDescs}`)
  }

  if (entry.aliases.length) {
    lines.push(`${pad}  别名: ${entry.aliases.join(', ')}`)
  }

  for (const child of entry.children) {
    lines.push(renderEntry(child, indent + 1))
  }

  return lines.join('\n')
}

export function renderCommandCatalog(entries: CommandCatalogEntry[]): string {
  const header = '## 可用指令\n'
  if (!entries.length) {
    return header + '\n（暂无可用指令）'
  }
  const body = entries.map((e) => renderEntry(e, 0)).join('\n')
  return header + '\n' + body
}

/**
 * Compact rendering for the agent's system prompt: only top-level commands,
 * one line each (`name — description`), no args/options/aliases/children.
 *
 * The agent is told to call `help <command>` when it actually needs a
 * command's details. Most commands are dead weight in casual chat, so this
 * keeps the system prompt small and the prompt cache cheap.
 */
export function renderCompactCatalog(entries: CommandCatalogEntry[]): string {
  const header = '## 可用指令（概览）'
  if (!entries.length) {
    return header + '\n\n（暂无可用指令）'
  }
  const lines = entries.map((e) => {
    const desc = e.description?.trim() || '(无描述)'
    return `- \`${e.name}\` — ${desc}`
  })
  return header + '\n\n' + lines.join('\n')
}

export function buildCommandCatalog(ctx: Context): CommandCatalogEntry[] {
  const list = (ctx as any).$commander?._commandList ?? []
  const visited = new WeakSet()

  const visit = (cmd: any): CommandCatalogEntry | null => {
    if (!cmd || visited.has(cmd)) return null
    if (cmd.config?.hidden) return null
    // 同时过滤掉 agent 不允许调用的命令——既不在 catalog 里出现，也不会被
    // dispatchTool 调到（双层防御）。
    if (isForbiddenAgentCommand(cmd.name)) return null
    visited.add(cmd)

    const description: string =
      ctx.i18n.text(['', cmd.locale ?? '', 'zh'], [`commands.${cmd.name}.description`], {}) ||
      cmd._description ||
      cmd.config?.description ||
      ''

    const args: CommandCatalogArg[] = (cmd._arguments ?? []).map((a: any) => ({
      name: a.name,
      type: typeof a.type === 'string' ? a.type : 'string',
      required: !!a.required,
      description: a.description,
    }))

    const options: CommandCatalogOption[] = (cmd._options
      ? Object.values(cmd._options)
      : []
    ).map((o: any) => ({
      name: o.name,
      type: typeof o.type === 'string' ? o.type : 'string',
      description: o.description,
    }))

    const aliases: string[] = cmd._aliases
      ? Object.keys(cmd._aliases).filter((a) => a !== cmd.name)
      : []

    const children = (cmd.children ?? [])
      .map(visit)
      .filter(Boolean) as CommandCatalogEntry[]

    return {
      name: cmd.displayName || cmd.name,
      description,
      args,
      options,
      aliases,
      children,
    }
  }

  // 仅处理顶层命令（无 parent 或 parent 是 root）
  return list
    .filter((cmd: any) => !cmd.parent || cmd.parent === cmd._root)
    .map(visit)
    .filter(Boolean) as CommandCatalogEntry[]
}
