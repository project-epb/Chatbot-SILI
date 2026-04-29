import { describe, it, expect } from 'vitest'
import {
  ToolRegistry,
  isForbiddenAgentCommand,
  renderAgentHelp,
  type ToolHandler,
} from '../tools'
import type { CommandCatalogEntry } from '../command-catalog'

const fakeHandler = (name: string, result = 'ok'): ToolHandler => ({
  definition: {
    name,
    description: `${name} desc`,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    return result
  },
})

describe('ToolRegistry', () => {
  it('starts empty', () => {
    const r = new ToolRegistry()
    expect(r.listDefinitions()).toEqual([])
    expect(r.get('foo')).toBeUndefined()
  })

  it('registers and retrieves a handler', () => {
    const r = new ToolRegistry()
    const h = fakeHandler('foo')
    r.register(h)
    expect(r.get('foo')).toBe(h)
    expect(r.listDefinitions()).toEqual([h.definition])
  })

  it('overwrites a handler with same name', () => {
    const r = new ToolRegistry()
    const a = fakeHandler('foo', 'a')
    const b = fakeHandler('foo', 'b')
    r.register(a)
    r.register(b)
    expect(r.get('foo')).toBe(b)
    expect(r.listDefinitions()).toHaveLength(1)
  })

  it('unregisters a handler', () => {
    const r = new ToolRegistry()
    r.register(fakeHandler('foo'))
    r.unregister('foo')
    expect(r.get('foo')).toBeUndefined()
    expect(r.listDefinitions()).toEqual([])
  })

  it('lists definitions in registration order', () => {
    const r = new ToolRegistry()
    r.register(fakeHandler('a'))
    r.register(fakeHandler('b'))
    r.register(fakeHandler('c'))
    expect(r.listDefinitions().map((d) => d.name)).toEqual(['a', 'b', 'c'])
  })
})

describe('isForbiddenAgentCommand', () => {
  it.each(['chat', 'llm', 'llm.reset', 'llm.memory', 'llm.catalog', 'llm.providers'])(
    'forbids %s',
    (name) => {
      expect(isForbiddenAgentCommand(name)).toBe(true)
    }
  )

  it.each(['pixiv.illust', 'homo', 'sticker', 'help', 'mediawiki', 'llmm', 'chat-history'])(
    'allows %s',
    (name) => {
      expect(isForbiddenAgentCommand(name)).toBe(false)
    }
  )

  it('does not match substrings (only prefix)', () => {
    expect(isForbiddenAgentCommand('foo.llm.bar')).toBe(false)
    expect(isForbiddenAgentCommand('not-llm.x')).toBe(false)
  })
})

describe('renderAgentHelp', () => {
  const catalog: CommandCatalogEntry[] = [
    {
      name: 'wiki',
      description: 'wiki cmd',
      args: [],
      options: [],
      aliases: [],
      children: [
        {
          name: 'wiki.connect',
          description: 'connect',
          args: [],
          options: [],
          aliases: [],
          children: [],
        },
      ],
    },
    {
      name: 'help',
      description: 'show help',
      args: [],
      options: [],
      aliases: [],
      children: [],
    },
  ]

  it('lists top-level commands when called without an arg', () => {
    const out = renderAgentHelp(catalog)
    expect(out).toContain('`wiki`')
    expect(out).toContain('`help`')
    // 不应该展开子命令
    expect(out).not.toContain('`wiki.connect`')
  })

  it('renders detail for a known top-level command', () => {
    const out = renderAgentHelp(catalog, 'wiki')
    expect(out).toContain('# wiki')
    expect(out).toContain('## 子指令')
    expect(out).toContain('`wiki.connect`')
  })

  it('renders detail for a nested command queried by full dot name', () => {
    const out = renderAgentHelp(catalog, 'wiki.connect')
    expect(out).toContain('# wiki.connect')
    expect(out).toContain('connect')
  })

  it('returns an error for unknown commands', () => {
    const out = renderAgentHelp(catalog, 'nope')
    expect(out).toMatch(/Error: command "nope" not found/)
  })

  it('returns placeholder when catalog is empty and no arg', () => {
    expect(renderAgentHelp([])).toBe('(暂无可用指令)')
  })
})
