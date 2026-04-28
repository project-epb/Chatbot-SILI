import { describe, it, expect } from 'vitest'
import {
  byteLength,
  truncateToByteLimit,
  isNoUpdateMagic,
  NO_UPDATE_MAGIC,
} from '../memory'

describe('byteLength', () => {
  it('returns ascii char count', () => {
    expect(byteLength('hello')).toBe(5)
  })

  it('returns utf-8 byte count for cjk', () => {
    expect(byteLength('你好')).toBe(6)
  })
})

describe('truncateToByteLimit', () => {
  it('returns input when under limit', () => {
    expect(truncateToByteLimit('hi', 10)).toBe('hi')
  })

  it('truncates ascii to limit', () => {
    expect(truncateToByteLimit('abcdef', 3)).toBe('abc')
  })

  it('truncates cjk on character boundary', () => {
    // 你=3 bytes，好=3 bytes。limit=4 应该只保留"你"
    expect(truncateToByteLimit('你好', 4)).toBe('你')
  })

  it('returns empty when limit is 0', () => {
    expect(truncateToByteLimit('abc', 0)).toBe('')
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
