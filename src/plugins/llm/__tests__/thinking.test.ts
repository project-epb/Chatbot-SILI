import { describe, it, expect } from 'vitest'
import { resolveThinkingLevel } from '../thinking'

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
      thinkingBudget: 4096,
    })
  })

  it.each([
    ['low', 1024],
    ['medium', 2048],
    ['mid', 2048],
    ['high', 4096],
    ['xhigh', 8192],
    ['max', 8192],
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
