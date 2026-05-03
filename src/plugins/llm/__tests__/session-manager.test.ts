import { describe, it, expect } from 'vitest'
import { isSessionExpired, truncateFirstMsg } from '../session-manager'

describe('truncateFirstMsg', () => {
  it('returns empty for null/undefined/whitespace', () => {
    expect(truncateFirstMsg('')).toBe('')
    expect(truncateFirstMsg('   ')).toBe('')
    expect(truncateFirstMsg(null as any)).toBe('')
    expect(truncateFirstMsg(undefined as any)).toBe('')
  })

  it('trims leading/trailing whitespace before measuring', () => {
    expect(truncateFirstMsg('  hi there  ')).toBe('hi there')
  })

  it('passes through strings under 30 codepoints unchanged', () => {
    expect(truncateFirstMsg('短消息')).toBe('短消息')
    expect(truncateFirstMsg('a'.repeat(30))).toBe('a'.repeat(30))
  })

  it('truncates ASCII strings to 30 codepoints', () => {
    expect(truncateFirstMsg('a'.repeat(50))).toBe('a'.repeat(30))
  })

  it('truncates by codepoint, not byte — Chinese stays intact', () => {
    const cn = '你' // 1 codepoint, 3 bytes in utf-8
    const out = truncateFirstMsg(cn.repeat(50))
    expect([...out]).toHaveLength(30)
    expect(out).toBe(cn.repeat(30))
  })

  it('does not split surrogate pairs (emoji)', () => {
    // 🐉 is a single codepoint (U+1F409) but 2 utf-16 code units.
    const dragon = '🐉'
    const out = truncateFirstMsg(dragon.repeat(40))
    expect([...out]).toHaveLength(30)
    expect(out).toBe(dragon.repeat(30))
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
