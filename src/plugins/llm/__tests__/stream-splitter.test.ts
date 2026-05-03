import { describe, it, expect } from 'vitest'
import { PROTOCOL_MARKERS } from '../protocol'
import { splitContent } from '../stream-splitter'

const CHUNK_BREAK_MARKER = PROTOCOL_MARKERS.MSG_BREAK

describe('splitContent', () => {
  it('returns empty for short buffer with no marker', () => {
    expect(splitContent('hi', 0)).toEqual({ text: '', nextIndex: 0 })
    expect(splitContent('a'.repeat(100), 0)).toEqual({
      text: '',
      nextIndex: 0,
    })
  })

  it('cuts at AI <msg_break/> marker', () => {
    const buf = 'first part' + CHUNK_BREAK_MARKER + 'second'
    const out = splitContent(buf, 0)
    expect(out.text).toBe('first part' + CHUNK_BREAK_MARKER)
    expect(out.nextIndex).toBe('first part'.length + CHUNK_BREAK_MARKER.length)
  })

  it('cuts on marker even when chunk is short', () => {
    const buf = 'a' + CHUNK_BREAK_MARKER + 'b'
    const out = splitContent(buf, 0)
    expect(out.text).toBe('a' + CHUNK_BREAK_MARKER)
  })

  it('cuts at first marker when there are multiple', () => {
    const buf =
      'one' + CHUNK_BREAK_MARKER + 'two' + CHUNK_BREAK_MARKER + 'three'
    const out = splitContent(buf, 0)
    expect(out.text).toBe('one' + CHUNK_BREAK_MARKER)
  })

  it('respects fromIndex offset', () => {
    const buf = 'PREFIX_' + 'mid' + CHUNK_BREAK_MARKER + 'tail'
    const out = splitContent(buf, 7)
    expect(out.text).toBe('mid' + CHUNK_BREAK_MARKER)
    expect(out.nextIndex).toBe(7 + 'mid'.length + CHUNK_BREAK_MARKER.length)
  })

  it('returns empty when fromIndex is past buffer end', () => {
    const out = splitContent('abc', 10)
    expect(out).toEqual({ text: '', nextIndex: 3 })
  })

  it('returns empty when only marker prefix is present (incomplete tag)', () => {
    // streaming 中 marker 可能被切到中间：'<msg_break' 还差 '/>'
    expect(splitContent('hello <msg_break', 0).text).toBe('')
  })

  describe('long-content fallback', () => {
    it('cuts at first \\n when buffer over maxLen', () => {
      const buf = 'a'.repeat(150) + '\n' + 'b'.repeat(50)
      const out = splitContent(buf, 0, { maxChunkLen: 100 })
      expect(out.text).toBe('a'.repeat(150) + '\n')
    })

    it('cuts even when \\n appears AFTER maxLen (first line >> maxLen)', () => {
      // 第一行 500 字超过 maxLen 200，\n 出现在 500 → 立即切发第一行
      const buf = 'a'.repeat(500) + '\n' + 'b'.repeat(50)
      const out = splitContent(buf, 0, { maxChunkLen: 200 })
      expect(out.text).toBe('a'.repeat(500) + '\n')
    })

    it('does NOT cut a single-line long buffer (no \\n at all)', () => {
      // 整段没换行 → 等 force flush，不切
      const buf = 'a'.repeat(800)
      const out = splitContent(buf, 0, { maxChunkLen: 200 })
      expect(out.text).toBe('')
    })

    it('does not cut buffer below maxLen even with newlines', () => {
      const buf = 'a'.repeat(50) + '\n' + 'b'.repeat(50)
      const out = splitContent(buf, 0, { maxChunkLen: 500 })
      expect(out.text).toBe('')
    })

    it('AI marker beats long-content fallback', () => {
      // 即使超长，AI 标记位置更靠前
      const buf = 'a' + CHUNK_BREAK_MARKER + 'b'.repeat(800)
      const out = splitContent(buf, 0, { maxChunkLen: 200 })
      expect(out.text).toBe('a' + CHUNK_BREAK_MARKER)
    })

    it('disables fallback once agent has emitted any marker (later in same turn)', () => {
      // 模拟"先解释 + marker + 长代码块"场景：
      //  - 第一次 splitContent 时 buffer 含 marker，cut 到 marker 后
      //  - fromIndex 推进到 marker 之后；之后流入的代码块即便超长也
      //    不该被兜底切，等下一个 marker 或 force flush
      const buf =
        'intro paragraph' + CHUNK_BREAK_MARKER + 'a'.repeat(400) + '\n' + 'b'.repeat(400)
      const afterMarker = 'intro paragraph'.length + CHUNK_BREAK_MARKER.length
      const out = splitContent(buf, afterMarker, { maxChunkLen: 200 })
      // rest 长 800 + 1 \n，超过 maxLen 200 也有 \n，按老逻辑会切；
      // 新逻辑发现 agent 已 opted in（buffer 含过 marker）→ 不切
      expect(out.text).toBe('')
    })

    it('still triggers fallback when agent has not used any marker', () => {
      // 整段无 marker，超长有 \n → 兜底切第一个 \n
      const buf = 'a'.repeat(500) + '\n' + 'b'.repeat(50)
      const out = splitContent(buf, 0, { maxChunkLen: 200 })
      expect(out.text).toBe('a'.repeat(500) + '\n')
    })
  })
})
