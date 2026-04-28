import { describe, it, expect } from 'vitest'
import { renderCommandCatalog, type CommandCatalogEntry } from '../command-catalog'

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
