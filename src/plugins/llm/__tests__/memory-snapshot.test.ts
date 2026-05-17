import { describe, expect, it, vi } from 'vitest'

import { buildMemorySnapshot } from '../services/memory-snapshot'

function mkMemory(over: {
  meta?: { content?: string; last_updated_at?: number } | null
  throws?: Error
}) {
  return {
    getMeta: vi.fn(async () => {
      if (over.throws) throw over.throws
      return over.meta ?? null
    }),
  }
}

describe('buildMemorySnapshot', () => {
  it('wraps memory content in <long_term_memory> tags', async () => {
    const mem = mkMemory({
      meta: { content: '- 喜欢热干面\n- 在杭州' },
    })
    const out = await buildMemorySnapshot(mem, 'qq', '123')
    expect(out).toMatch(/^<long_term_memory>/)
    expect(out).toMatch(/<\/long_term_memory>$/)
    expect(out).toContain('喜欢热干面')
    expect(out).toContain('在杭州')
  })

  it('includes a stewardship note explaining the freeze + refresh option', async () => {
    const mem = mkMemory({ meta: { content: 'something' } })
    const out = await buildMemorySnapshot(mem, 'qq', '123')
    expect(out).toContain('freeze')
    expect(out).toContain('read_user_memory')
  })

  it('returns empty string when meta is null', async () => {
    const mem = mkMemory({ meta: null })
    const out = await buildMemorySnapshot(mem, 'qq', '123')
    expect(out).toBe('')
  })

  it('returns empty string when content is empty / whitespace', async () => {
    const mem1 = mkMemory({ meta: { content: '' } })
    expect(await buildMemorySnapshot(mem1, 'qq', '1')).toBe('')

    const mem2 = mkMemory({ meta: { content: '   \n  ' } })
    expect(await buildMemorySnapshot(mem2, 'qq', '1')).toBe('')
  })

  it('returns empty and warns when fetch throws', async () => {
    const mem = mkMemory({ throws: new Error('db down') })
    const logger = { warn: vi.fn() } as any
    const out = await buildMemorySnapshot(mem, 'qq', '1', logger)
    expect(out).toBe('')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('does not throw when fetch fails and no logger is passed', async () => {
    const mem = mkMemory({ throws: new Error('db down') })
    const out = await buildMemorySnapshot(mem, 'qq', '1')
    expect(out).toBe('')
  })

  it('trims surrounding whitespace from content before rendering', async () => {
    const mem = mkMemory({
      meta: { content: '\n\n  - 内容  \n\n' },
    })
    const out = await buildMemorySnapshot(mem, 'qq', '123')
    expect(out).toContain('- 内容')
    // shouldn't have leading/trailing whitespace inside the block body
    expect(out).not.toMatch(/<long_term_memory>\n\s+\n/)
  })

  it('calls getMeta with the provided platform + userId', async () => {
    const mem = mkMemory({ meta: { content: 'x' } })
    await buildMemorySnapshot(mem, 'qq', '999')
    expect(mem.getMeta).toHaveBeenCalledWith('qq', '999')
  })
})
