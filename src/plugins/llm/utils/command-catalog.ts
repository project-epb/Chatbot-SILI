import { Context } from 'koishi'

import { isForbiddenAgentCommand } from '../tools'

export interface CommandCatalogArg {
  name: string
  type: string
  required: boolean
  description?: string
}

export interface CommandCatalogOption {
  name: string
  type: string
  /** Full koishi-rendered syntax e.g. `-d, --difficulty <difficulty>`. */
  syntax?: string
  description?: string
}

export interface CommandCatalogEntry {
  name: string
  description: string
  /** Long-form usage block (multi-line, often with examples). */
  usage?: string
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
      .map(
        (a) =>
          `${a.name}(${a.type}${a.description ? ', ' + a.description : ''})`
      )
      .join(', ')
    lines.push(`${pad}  参数: ${argDescs}`)
  }

  if (entry.options.length) {
    const optDescs = entry.options
      .map(
        (o) => `--${o.name}${o.description ? '(' + o.description + ')' : ''}`
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
 * Find an entry in the catalog by exact name (recurses into children).
 */
export function findCatalogEntry(
  entries: readonly CommandCatalogEntry[],
  name: string
): CommandCatalogEntry | null {
  for (const e of entries) {
    if (e.name === name) return e
    const found = findCatalogEntry(e.children, name)
    if (found) return found
  }
  return null
}

/**
 * Detailed rendering for a single entry, written for the agent. Crucially
 * different from koishi's native `help`: child commands are listed with
 * their real dot-namespaced names (e.g. `wiki.connect`) so the agent
 * cannot misread space-separated paths as separate commands.
 */
export function renderCatalogEntryDetail(entry: CommandCatalogEntry): string {
  const lines: string[] = []
  const argSig = entry.args
    .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`))
    .join(' ')
  const heading = [entry.name, argSig].filter(Boolean).join(' ')

  lines.push(`# ${heading}`)
  lines.push('')
  lines.push(entry.description?.trim() || '(无描述)')

  if (entry.usage?.trim()) {
    lines.push('')
    lines.push('## 用法')
    lines.push(entry.usage.trim())
  }

  if (entry.args.length) {
    lines.push('')
    lines.push('## 参数')
    for (const a of entry.args) {
      const tags = [a.required ? '必需' : '可选', `类型: ${a.type}`].join(', ')
      const desc = a.description ? ' — ' + a.description : ''
      lines.push(`- \`${a.name}\` (${tags})${desc}`)
    }
  }

  if (entry.options.length) {
    lines.push('')
    lines.push('## 选项')
    lines.push('（调用时**必须用 `--long` 名字**；短旗标 `-x` 仅供参考）')
    for (const o of entry.options) {
      // Reorder koishi's `-d, --difficulty <difficulty>` into
      // `--difficulty <difficulty>, -d` — long form first so agents lock
      // onto the actually-usable name; short flag kept as a recognition aid.
      const parts =
        o.syntax
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? []
      const longs = parts.filter((s) => s.startsWith('--'))
      const shorts = parts.filter((s) => /^-[^-]/.test(s))
      const sig = [...longs, ...shorts].join(', ') || `--${o.name}`
      const desc = o.description ? ' — ' + o.description : ''
      lines.push(`- \`${sig}\`${desc}`)
    }
  }

  if (entry.aliases.length) {
    lines.push('')
    lines.push(`## 别名`)
    lines.push('（仅供参考，name 填原始名）')
    lines.push(entry.aliases.map((a) => `\`${a}\``).join(', '))
  }

  if (entry.children.length) {
    lines.push('')
    lines.push('## 子指令')
    lines.push(
      `（子指令有两种：带\`.\`号=命名空间，${entry.name}.foo → name=${entry.name}.foo；无点号=仅分类，${entry.name}/bar → name=bar）。` +
        `子指令可能有自己的参数，建议调用前查看帮助，例如 \`help ${entry.children[0].name}\`）`
    )
    for (const c of entry.children) {
      const desc = c.description?.trim() || '(无描述)'
      lines.push(`- \`${c.name}\` — ${desc}`)
    }
  }

  return lines.join('\n')
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

    const localeFallback = ['', cmd.locale ?? '', 'zh']
    const i18n = (key: string): string =>
      ctx.i18n.text(localeFallback, [key], {}) || ''

    const description: string =
      i18n(`commands.${cmd.name}.description`) ||
      cmd._description ||
      cmd.config?.description ||
      ''

    // koishi help: prefer `cmd._usage` (string form) over i18n. Function-form
    // `_usage` needs a session, which we don't have here — skip it.
    let usage = ''
    if (typeof cmd._usage === 'string') usage = cmd._usage
    if (!usage) usage = i18n(`commands.${cmd.name}.usage`)

    const args: CommandCatalogArg[] = (cmd._arguments ?? []).map((a: any) => ({
      name: a.name,
      type: typeof a.type === 'string' ? a.type : 'string',
      required: !!a.required,
      description: a.description,
    }))

    const options: CommandCatalogOption[] = (
      cmd._options ? Object.values(cmd._options) : []
    ).map((o: any) => ({
      name: o.name,
      type: typeof o.type === 'string' ? o.type : 'string',
      syntax: o.syntax || '',
      // koishi stores option descriptions in i18n by default; fall back to
      // `o.description` for options declared via the JS API with an inline
      // description (rare in this codebase but supported by koishi).
      description:
        i18n(`commands.${cmd.name}.options.${o.name}`) || o.description || '',
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
      usage,
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
