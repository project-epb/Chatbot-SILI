import { describe, it, expect } from 'vitest'
import { clampThinkingBudget, resolveThinkingLevel } from '../utils/thinking'

describe('resolveThinkingLevel', () => {
  it('defaults to low when undefined', () => {
    expect(resolveThinkingLevel(undefined)).toEqual({
      enableThinking: true,
      thinkingBudget: 1024,
    })
  })

  it('treats unknown values as low', () => {
    expect(resolveThinkingLevel('something-weird')).toEqual({
      enableThinking: true,
      thinkingBudget: 1024,
    })
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(resolveThinkingLevel('  HIGH \n')).toEqual({
      enableThinking: true,
      thinkingBudget: 8192,
    })
  })

  it.each([
    ['low', 1024],
    ['medium', 4096],
    ['mid', 4096],
    ['high', 8192],
    ['xhigh', 16384],
    ['max', 16384],
  ])('maps %s -> %d', (level, budget) => {
    expect(resolveThinkingLevel(level)).toEqual({
      enableThinking: true,
      thinkingBudget: budget,
    })
  })

  it.each(['no', 'none', 'false', 'off', 'NO', 'False'])(
    'disables thinking for %s',
    (level) => {
      expect(resolveThinkingLevel(level)).toEqual({
        enableThinking: false,
        thinkingBudget: 0,
      })
    }
  )
})

describe('clampThinkingBudget', () => {
  it('returns the budget when there is enough headroom', () => {
    expect(clampThinkingBudget(4096, 16384)).toBe(4096)
  })

  it('clamps to maxTokens minus reserve', () => {
    // 8192 - 512 reserve = 7680
    expect(clampThinkingBudget(16384, 8192)).toBe(7680)
  })

  it('returns 0 when maxTokens is below the reserve', () => {
    expect(clampThinkingBudget(1024, 256)).toBe(0)
  })

  it('returns 0 when maxTokens equals the reserve', () => {
    expect(clampThinkingBudget(1024, 512)).toBe(0)
  })

  it('honors a custom reserve', () => {
    expect(clampThinkingBudget(1024, 2048, 1024)).toBe(1024)
    expect(clampThinkingBudget(2048, 2048, 1024)).toBe(1024)
  })

  it('floors a negative budget to 0', () => {
    expect(clampThinkingBudget(-100, 4096)).toBe(0)
  })
})
