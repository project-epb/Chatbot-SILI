import { describe, it, expect } from 'vitest'
import { byteLength, isNoUpdateMagic, NO_UPDATE_MAGIC } from '../services/memory'

describe('byteLength', () => {
  it('returns ascii char count', () => {
    expect(byteLength('hello')).toBe(5)
  })

  it('returns utf-8 byte count for cjk', () => {
    expect(byteLength('你好')).toBe(6)
  })
})

describe('isNoUpdateMagic', () => {
  it('matches exact magic value', () => {
    expect(isNoUpdateMagic(NO_UPDATE_MAGIC)).toBe(true)
  })

  it('matches with surrounding whitespace', () => {
    expect(isNoUpdateMagic(`  ${NO_UPDATE_MAGIC}\n`)).toBe(true)
  })

  it('does not match plain text', () => {
    expect(isNoUpdateMagic('hello')).toBe(false)
  })

  it('does not match if magic value is embedded', () => {
    expect(isNoUpdateMagic(`prefix ${NO_UPDATE_MAGIC} suffix`)).toBe(false)
  })
})
