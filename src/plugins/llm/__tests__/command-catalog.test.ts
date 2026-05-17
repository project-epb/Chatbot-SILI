import { describe, it, expect } from 'vitest'
import {
  findCatalogEntry,
  renderCatalogEntryDetail,
  renderCommandCatalog,
  renderCompactCatalog,
  type CommandCatalogEntry,
} from '../utils/command-catalog'

describe('renderCommandCatalog', () => {
  it('renders empty catalog', () => {
    const out = renderCommandCatalog([])
    expect(out).toContain('## 可用指令')
    expect(out).toMatch(/(暂无|none)/i)
  })

  it('renders single root command', () => {
    const entries: CommandCatalogEntry[] = [
      {
        name: 'help',
        description: '显示帮助',
        args: [],
        options: [],
        aliases: [],
        children: [],
      },
    ]
    const out = renderCommandCatalog(entries)
    expect(out).toContain('help — 显示帮助')
  })

  it('renders args with type and required', () => {
    const entries: CommandCatalogEntry[] = [
      {
        name: 'pixiv.illust',
        description: '获取插画',
        args: [
          { name: 'id', type: 'posint', required: true, description: '插画ID' },
        ],
        options: [],
        aliases: [],
        children: [],
      },
    ]
    const out = renderCommandCatalog(entries)
    expect(out).toContain('pixiv.illust <id>')
    expect(out).toContain('id(posint, 插画ID)')
  })

  it('renders options', () => {
    const entries: CommandCatalogEntry[] = [
      {
        name: 'foo',
        description: 'foo cmd',
        args: [],
        options: [
          { name: 'verbose', type: 'boolean', description: '详细输出' },
        ],
        aliases: [],
        children: [],
      },
    ]
    const out = renderCommandCatalog(entries)
    expect(out).toContain('--verbose')
  })

  it('renders aliases', () => {
    const entries: CommandCatalogEntry[] = [
      {
        name: 'sticker',
        description: '生成表情包',
        args: [],
        options: [],
        aliases: ['表情包'],
        children: [],
      },
    ]
    const out = renderCommandCatalog(entries)
    expect(out).toContain('别名: 表情包')
  })

  it('indents children', () => {
    const entries: CommandCatalogEntry[] = [
      {
        name: 'sticker',
        description: '表情包',
        args: [],
        options: [],
        aliases: [],
        children: [
          {
            name: 'sticker.cat',
            description: '猫表情',
            args: [],
            options: [],
            aliases: [],
            children: [],
          },
        ],
      },
    ]
    const out = renderCommandCatalog(entries)
    const catLine = out.split('\n').find((l) => l.includes('sticker.cat'))
    expect(catLine).toMatch(/^\s{2}/)
  })
})

describe('renderCompactCatalog', () => {
  const empty: CommandCatalogEntry[] = []
  const sample: CommandCatalogEntry[] = [
    {
      name: 'help',
      description: '显示帮助',
      args: [{ name: 'command', type: 'string', required: false }],
      options: [],
      aliases: [],
      children: [],
    },
    {
      name: 'pixiv.illust',
      description: '获取插画',
      args: [{ name: 'id', type: 'posint', required: true }],
      options: [{ name: 'raw', type: 'boolean', description: '原图' }],
      aliases: ['p.i'],
      children: [],
    },
    {
      name: 'sticker',
      description: '生成贴纸',
      args: [],
      options: [],
      aliases: ['UNIQUE_ALIAS_X'],
      children: [
        {
          name: 'sticker.cat',
          description: '猫贴纸',
          args: [],
          options: [],
          aliases: [],
          children: [],
        },
      ],
    },
  ]

  it('renders empty placeholder', () => {
    const out = renderCompactCatalog(empty)
    expect(out).toContain('## 可用指令')
    expect(out).toMatch(/暂无/)
  })

  it('emits one bullet per top-level command', () => {
    const out = renderCompactCatalog(sample)
    const lines = out.split('\n').filter((l) => l.startsWith('- '))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('`help`')
    expect(lines[1]).toContain('`pixiv.illust`')
    expect(lines[2]).toContain('`sticker`')
  })

  it('does not include args, options, aliases, or children', () => {
    const out = renderCompactCatalog(sample)
    expect(out).not.toContain('参数')
    expect(out).not.toContain('选项')
    expect(out).not.toContain('--raw')
    expect(out).not.toContain('原图')
    expect(out).not.toContain('p.i')
    expect(out).not.toContain('别名')
    expect(out).not.toContain('UNIQUE_ALIAS_X')
    expect(out).not.toContain('sticker.cat')
    expect(out).not.toContain('猫贴纸')
  })

  it('substitutes a placeholder for missing description', () => {
    const out = renderCompactCatalog([
      {
        name: 'foo',
        description: '',
        args: [],
        options: [],
        aliases: [],
        children: [],
      },
    ])
    expect(out).toContain('`foo`')
    expect(out).toContain('(无描述)')
  })

  it('compact output is dramatically shorter than verbose for the same input', () => {
    const verbose = renderCommandCatalog(sample)
    const compact = renderCompactCatalog(sample)
    expect(compact.length).toBeLessThan(verbose.length)
  })
})

describe('findCatalogEntry', () => {
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
        {
          name: 'wiki.search',
          description: 'search',
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

  it('finds top-level entries by exact name', () => {
    expect(findCatalogEntry(catalog, 'wiki')?.name).toBe('wiki')
    expect(findCatalogEntry(catalog, 'help')?.name).toBe('help')
  })

  it('finds nested entries by exact name', () => {
    expect(findCatalogEntry(catalog, 'wiki.connect')?.name).toBe('wiki.connect')
    expect(findCatalogEntry(catalog, 'wiki.search')?.description).toBe('search')
  })

  it('returns null for unknown', () => {
    expect(findCatalogEntry(catalog, 'nope')).toBeNull()
    expect(findCatalogEntry(catalog, 'wiki connect')).toBeNull() // 含空格不匹配
  })
})

describe('renderCatalogEntryDetail', () => {
  it('renders heading, description, args, options, aliases, children', () => {
    const entry: CommandCatalogEntry = {
      name: 'wiki',
      description: 'MediaWiki 工具',
      args: [
        { name: 'titles', type: 'string', required: false, description: '页面' },
      ],
      options: [
        { name: 'details', type: 'boolean', description: '详情' },
        { name: 'search', type: 'boolean' },
      ],
      aliases: ['维基'],
      children: [
        {
          name: 'wiki.connect',
          description: '连接群与 wiki',
          args: [],
          options: [],
          aliases: [],
          children: [],
        },
      ],
    }
    const out = renderCatalogEntryDetail(entry)
    expect(out).toContain('# wiki [titles]')
    expect(out).toContain('MediaWiki 工具')
    expect(out).toContain('## 参数')
    expect(out).toContain('`titles`')
    expect(out).toContain('## 选项')
    expect(out).toContain('`--details`')
    expect(out).toContain('## 别名')
    expect(out).toContain('维基')
    expect(out).toContain('## 子指令')
    expect(out).toContain('`wiki.connect`')
    // 不能出现 koishi 风格的空格分隔子指令
    expect(out).not.toMatch(/wiki connect/)
  })

  it('omits empty sections', () => {
    const entry: CommandCatalogEntry = {
      name: 'foo',
      description: '一个简单指令',
      args: [],
      options: [],
      aliases: [],
      children: [],
    }
    const out = renderCatalogEntryDetail(entry)
    expect(out).toContain('# foo')
    expect(out).toContain('一个简单指令')
    expect(out).not.toContain('## 参数')
    expect(out).not.toContain('## 选项')
    expect(out).not.toContain('## 别名')
    expect(out).not.toContain('## 子指令')
  })

  it('uses required-vs-optional brackets in heading', () => {
    const entry: CommandCatalogEntry = {
      name: 'foo',
      description: 'd',
      args: [
        { name: 'a', type: 'string', required: true },
        { name: 'b', type: 'string', required: false },
      ],
      options: [],
      aliases: [],
      children: [],
    }
    const out = renderCatalogEntryDetail(entry)
    expect(out).toContain('# foo <a> [b]')
  })
})
