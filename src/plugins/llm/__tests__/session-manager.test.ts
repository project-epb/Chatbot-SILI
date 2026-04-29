import { describe, it, expect } from 'vitest'
import { composeSystemPrompt, isSessionExpired } from '../session-manager'

const CATALOG = '## 可用指令\n\nfoo — example command'
const MEMORY = '- 喜欢吃热干面'
const BASE = 'you are SILI, a 19yo girl'

describe('composeSystemPrompt', () => {
  it('returns just the base prompt when catalog and memory are both empty', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: '',
      memory_snapshot: '',
    })
    expect(out).toBe(BASE)
  })

  it('appends the catalog and tool-usage section when catalog is non-empty', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: '',
    })
    expect(out).toContain(BASE)
    expect(out).toContain(CATALOG)
    expect(out).toContain('## 调用工具')
    expect(out).toContain('execute_koishi_command')
    expect(out).not.toContain('长期记忆')
  })

  it('appends the memory section when memory is non-empty', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: '',
      memory_snapshot: MEMORY,
    })
    expect(out).toContain(BASE)
    expect(out).toContain('## 关于这个用户的长期记忆')
    expect(out).toContain(MEMORY)
    expect(out).not.toContain('## 调用工具')
  })

  it('combines all three when present, in stable order', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: MEMORY,
    })
    const baseIdx = out.indexOf(BASE)
    const catalogIdx = out.indexOf(CATALOG)
    const memoryIdx = out.indexOf(MEMORY)
    expect(baseIdx).toBeGreaterThanOrEqual(0)
    expect(catalogIdx).toBeGreaterThan(baseIdx)
    expect(memoryIdx).toBeGreaterThan(catalogIdx)
  })

  it('is deterministic — same input produces byte-identical output', () => {
    const a = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: MEMORY,
    })
    const b = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: MEMORY,
    })
    expect(a).toBe(b)
  })
})

describe('isSessionExpired', () => {
  const NOW = 1_000_000_000_000
  const HOUR = 60 * 60 * 1000
  const TTL_12H = 12 * HOUR

  it('returns false when last used right now', () => {
    expect(isSessionExpired({ last_used_at: NOW }, TTL_12H, NOW)).toBe(false)
  })

  it('returns false at exactly the TTL boundary', () => {
    expect(
      isSessionExpired({ last_used_at: NOW - TTL_12H }, TTL_12H, NOW)
    ).toBe(false)
  })

  it('returns true 1ms past the TTL', () => {
    expect(
      isSessionExpired({ last_used_at: NOW - TTL_12H - 1 }, TTL_12H, NOW)
    ).toBe(true)
  })

  it('returns true when last used a day ago at 12h TTL', () => {
    expect(
      isSessionExpired({ last_used_at: NOW - 24 * HOUR }, TTL_12H, NOW)
    ).toBe(true)
  })

  it('disables expiry when ttl is 0', () => {
    expect(
      isSessionExpired({ last_used_at: NOW - 365 * 24 * HOUR }, 0, NOW)
    ).toBe(false)
  })

  it('disables expiry when ttl is negative', () => {
    expect(isSessionExpired({ last_used_at: NOW }, -1, NOW)).toBe(false)
  })
})
