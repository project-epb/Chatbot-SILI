import { describe, it, expect } from 'vitest'
import { buildMemoryForkUserPrompt } from '../memory-fork'
import { NO_UPDATE_MAGIC } from '../memory'

describe('buildMemoryForkUserPrompt', () => {
  it('substitutes the existing memory placeholder', () => {
    const out = buildMemoryForkUserPrompt('user likes hot dry noodles', 3000, 3300)
    expect(out).toContain('user likes hot dry noodles')
    expect(out).not.toContain('{{EXISTING_MEMORY}}')
  })

  it('shows "(空)" when memory is empty', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    expect(out).toContain('(空)')
    expect(out).not.toContain('{{EXISTING_MEMORY}}')
  })

  it('substitutes both byte limits', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    expect(out).toContain('3000')
    expect(out).toContain('3300')
    expect(out).not.toMatch(/\{\{(SOFT|HARD)_LIMIT\}\}/)
  })

  it('substitutes the magic value placeholder', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    expect(out).toContain(NO_UPDATE_MAGIC)
    expect(out).not.toContain('{{NO_UPDATE_MAGIC}}')
  })

  it('substitutes all occurrences (placeholder appears multiple times)', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    // NO_UPDATE_MAGIC 在模板里出现至少两次（在 "输出格式" 和 "取舍准则" 两处）
    const matches = out.match(new RegExp(NO_UPDATE_MAGIC, 'g'))
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('mentions both "should record" and "should NOT record" sections', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    expect(out).toMatch(/该记什么|应记|长期偏好/)
    expect(out).toMatch(/不要记|绝对不要|不该记/)
  })
})
