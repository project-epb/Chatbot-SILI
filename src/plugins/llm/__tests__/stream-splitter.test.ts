import { describe, it, expect } from 'vitest'
import { splitContent } from '../stream-splitter'

describe('splitContent', () => {
  it('returns empty when buffer too short', () => {
    expect(splitContent('hi', 0)).toEqual({ text: '', nextIndex: 0 })
    expect(splitContent('a'.repeat(30), 0)).toEqual({
      text: '',
      nextIndex: 0,
    })
  })

  it('cuts on paragraph break (\\n\\n) once past minLen', () => {
    const buf = 'a'.repeat(50) + '\n\n' + 'b'.repeat(50)
    const out = splitContent(buf, 0)
    expect(out.text).toBe('a'.repeat(50) + '\n\n')
    expect(out.nextIndex).toBe(52)
  })

  it('does not cut on \\n\\n if it appears too early (< minLen)', () => {
    const buf = 'short\n\n' + 'a'.repeat(60)
    const out = splitContent(buf, 0, { minChunkLen: 40 })
    // \n\n 在 5,6 位置（< 40），不切；后面是普通文字也没到 target，所以不切
    expect(out.text).toBe('')
  })

  it('cuts on sentence end (。) once past targetLen', () => {
    const buf = 'a'.repeat(80) + '。' + 'b'.repeat(80) + '。' + 'c'.repeat(20)
    const out = splitContent(buf, 0, {
      minChunkLen: 40,
      targetChunkLen: 100,
    })
    // 第一段长 81，到 target=100 还差，加上第二段开头到达 target 时找最近的 。
    // window 包含 0~150 区间内最后一个 。在第二段尾（位置 161），但 window
    // 限制 0~150，所以拿到第一段尾的 。（位置 80）
    expect(out.text).toBe('a'.repeat(80) + '。')
    expect(out.nextIndex).toBe(81)
  })

  it('cuts on Chinese ! ? as sentence end', () => {
    const buf1 = 'a'.repeat(80) + '！' + 'b'.repeat(80)
    const out1 = splitContent(buf1, 0, { targetChunkLen: 100 })
    expect(out1.text).toBe('a'.repeat(80) + '！')

    const buf2 = 'a'.repeat(80) + '？' + 'b'.repeat(80)
    const out2 = splitContent(buf2, 0, { targetChunkLen: 100 })
    expect(out2.text).toBe('a'.repeat(80) + '？')
  })

  it('cuts on ASCII ! ? as sentence end', () => {
    const buf1 = 'a'.repeat(80) + '!' + 'b'.repeat(80)
    const out1 = splitContent(buf1, 0, { targetChunkLen: 100 })
    expect(out1.text).toBe('a'.repeat(80) + '!')

    const buf2 = 'a'.repeat(80) + '?' + 'b'.repeat(80)
    const out2 = splitContent(buf2, 0, { targetChunkLen: 100 })
    expect(out2.text).toBe('a'.repeat(80) + '?')
  })

  it('falls back to soft \\n when no sentence end in window', () => {
    const buf = 'a'.repeat(80) + '\n' + 'b'.repeat(80)
    const out = splitContent(buf, 0, {
      minChunkLen: 40,
      targetChunkLen: 100,
    })
    expect(out.text).toBe('a'.repeat(80) + '\n')
    expect(out.nextIndex).toBe(81)
  })

  it('prefers paragraph break over sentence end when both available', () => {
    // 注意：段落 break (\n\n) 检测会先找，targetLen 之内的句末 . 退而求其次
    const buf = 'a'.repeat(60) + '。' + 'b'.repeat(20) + '\n\n' + 'c'.repeat(50)
    const out = splitContent(buf, 0, {
      minChunkLen: 40,
      targetChunkLen: 100,
    })
    // 段落 break 在 81 位置，paragraph 优先级 1 命中
    expect(out.text).toBe('a'.repeat(60) + '。' + 'b'.repeat(20) + '\n\n')
  })

  it('force-cuts when over maxLen with fallback boundary', () => {
    // 一长串无句末符号，到 maxLen 强切找次级（逗号/空格等）
    const buf = 'a'.repeat(150) + '，' + 'b'.repeat(150)
    const out = splitContent(buf, 0, {
      minChunkLen: 40,
      targetChunkLen: 120,
      maxChunkLen: 200,
    })
    // window=0..200，最后一个 boundary 是 ， 在位置 150
    expect(out.text).toBe('a'.repeat(150) + '，')
    expect(out.nextIndex).toBe(151)
  })

  it('force-cuts at maxLen when no boundary at all', () => {
    const buf = 'a'.repeat(400)
    const out = splitContent(buf, 0, {
      minChunkLen: 40,
      targetChunkLen: 120,
      maxChunkLen: 200,
    })
    expect(out.text.length).toBe(200)
    expect(out.nextIndex).toBe(200)
  })

  it('handles markdown list cleanly (each \\n is soft break, not split point)', () => {
    // 老实现里 \n 算 split point，5 行后就要切；新实现按字符数累积
    const buf =
      '当然可以！\n\n' +
      '能生成的种类：\n' +
      '- 加油\n' +
      '- 喜报\n' +
      '- 悲报\n' +
      '- 蔚蓝档案\n' +
      '- HTTP 状态码\n'
    const out = splitContent(buf, 0, { minChunkLen: 40, targetChunkLen: 120 })
    // 第一个 \n\n 在「！」后位置 5，是段落边界，但 < minLen=40 → 不在此切
    // 累积到 buffer 末尾还不到 targetLen → 不切（等 force flush）
    // 但段落边界在 minLen 之前不切：因为我们要求 paraSearchFrom = minLen - 2
    expect(out.text).toBe('')
  })

  it('cuts after first paragraph when paragraph itself is long enough', () => {
    const buf =
      '段落一'.padEnd(50, '长') +    // 50 字符
      '\n\n' +
      '段落二的内容紧接着来'
    const out = splitContent(buf, 0, { minChunkLen: 40 })
    expect(out.text).toBe('段落一'.padEnd(50, '长') + '\n\n')
  })

  it('does not cut on \\n\\n when paragraph itself is too short', () => {
    // 即便整个 buffer ≥ minLen，第一个段落 < minLen 时不在 \n\n 切——
    // 切了等于发个超短消息，体验差
    const buf = '太短了。\n\n' + 'a'.repeat(60)
    const out = splitContent(buf, 0, { minChunkLen: 40 })
    // 段落一只有 5 字，buffer 累积到 < target/max，不切
    expect(out.text).toBe('')
  })

  it('respects fromIndex offset', () => {
    const buf = 'PREFIX...' + 'a'.repeat(60) + '。' + 'b'.repeat(60)
    const fromIndex = 9 // 跳过 PREFIX...
    const out = splitContent(buf, fromIndex, {
      minChunkLen: 40,
      targetChunkLen: 100,
    })
    expect(out.text).toBe('a'.repeat(60) + '。')
    expect(out.nextIndex).toBe(fromIndex + 61)
  })

  it('returns empty when fromIndex past buffer end', () => {
    const out = splitContent('abc', 10)
    expect(out).toEqual({ text: '', nextIndex: 3 })
  })

  it('eats trailing closing quote after sentence end (no orphan 」)', () => {
    // `！` 后紧跟 `」` 是同一句子，不该切到两片
    const buf = 'a'.repeat(80) + '！」' + 'b'.repeat(80)
    const out = splitContent(buf, 0, { targetChunkLen: 100 })
    expect(out.text).toBe('a'.repeat(80) + '！」')
    expect(out.nextIndex).toBe(82)
  })

  it('eats trailing 》/）/】/" too', () => {
    expect(
      splitContent('a'.repeat(80) + '！）' + 'b'.repeat(80), 0, {
        targetChunkLen: 100,
      }).text
    ).toBe('a'.repeat(80) + '！）')
    expect(
      splitContent('a'.repeat(80) + '?"' + 'b'.repeat(80), 0, {
        targetChunkLen: 100,
      }).text
    ).toBe('a'.repeat(80) + '?"')
  })

  it('does not cut when sentence end is at the very buffer tail (waiting for ])', () => {
    // buffer 末尾是 `！`，可能 `」` 还在路上 → 等下个 token，避免单独发 `」`
    const buf = 'a'.repeat(120) + '！'
    const out = splitContent(buf, 0, { targetChunkLen: 100 })
    expect(out.text).toBe('') // 等
  })

  it('cuts once trailing 」 arrives', () => {
    const buf = 'a'.repeat(120) + '！」'
    const out = splitContent(buf, 0, { targetChunkLen: 100 })
    expect(out.text).toBe('a'.repeat(120) + '！」')
  })
})
