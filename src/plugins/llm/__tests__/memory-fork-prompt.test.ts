import { describe, it, expect } from 'vitest'
import { buildMemoryForkUserPrompt } from '../services/memory-fork'
import { NO_UPDATE_MAGIC } from '../services/memory'

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

  it('substitutes the {{TODAY}} placeholder with the supplied date', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300, '2026-05-07')
    expect(out).toContain('2026-05-07')
    expect(out).not.toContain('{{TODAY}}')
  })

  it('teaches declarative-not-imperative phrasing', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    expect(out).toMatch(/声明性|声明|不要写成命令|声明性陈述/)
  })

  it('forbids recording user requests to alter SILI persona', () => {
    const out = buildMemoryForkUserPrompt('', 3000, 3300)
    expect(out).toMatch(/SILI.*人设|SILI 自身|SILI 自己|不是私人助理/)
  })
})
