import { describe, it, expect } from 'vitest'
import { sanitizeAgentOutput } from '../output-filter'

describe('sanitizeAgentOutput', () => {
  it('passes plain text through unchanged', () => {
    expect(sanitizeAgentOutput('hello world')).toBe('hello world')
    expect(sanitizeAgentOutput('你好，世界！')).toBe('你好，世界！')
  })

  it('returns empty string unchanged', () => {
    expect(sanitizeAgentOutput('')).toBe('')
  })

  it('keeps allowed elements (<a>, <img>)', () => {
    const out = sanitizeAgentOutput(
      '看看 <a href="https://example.com">这个</a>'
    )
    expect(out).toContain('<a href="https://example.com">')
    expect(out).toContain('这个')
    expect(out).toContain('</a>')
  })

  it('keeps <img> with src', () => {
    const out = sanitizeAgentOutput('<img src="https://x.com/a.png"/>')
    expect(out).toContain('<img')
    expect(out).toContain('src="https://x.com/a.png"')
  })

  it('strips <at> element but preserves children text', () => {
    const out = sanitizeAgentOutput('Hi <at id="123">小鱼</at>!')
    expect(out).not.toContain('<at')
    expect(out).not.toContain('</at')
    expect(out).toContain('小鱼')
    expect(out).toContain('Hi')
    expect(out).toContain('!')
  })

  it('strips <sharp> and <face> elements', () => {
    const out1 = sanitizeAgentOutput('频道 <sharp id="42">general</sharp> 你好')
    expect(out1).not.toContain('<sharp')
    expect(out1).toContain('general')

    const out2 = sanitizeAgentOutput('<face id="haha"/>')
    expect(out2).not.toContain('<face')
  })

  it('keeps <quote> (system-injected, must pass through)', () => {
    const out = sanitizeAgentOutput('<quote id="100"/>回复')
    expect(out).toContain('<quote')
    expect(out).toContain('id="100"')
    expect(out).toContain('回复')
  })

  it('keeps richtext tags (b/i/em/strong/p/br)', () => {
    const out = sanitizeAgentOutput('<b>粗体</b> 和 <i>斜体</i>')
    expect(out).toContain('<b>')
    expect(out).toContain('粗体')
    expect(out).toContain('<i>')
    expect(out).toContain('斜体')
  })

  it('handles a mix of allowed and disallowed elements', () => {
    const out = sanitizeAgentOutput(
      '<at id="1"/>看 <a href="https://x.com">链接</a><face id="ok"/>'
    )
    expect(out).not.toContain('<at')
    expect(out).not.toContain('<face')
    expect(out).toContain('<a href="https://x.com">')
    expect(out).toContain('链接')
  })

  it('does not throw on malformed/incomplete tags from streaming', () => {
    // 流式分片可能切出 `<at id="` 这种不完整片段；只要不抛错就 OK
    expect(() => sanitizeAgentOutput('text <at id="')).not.toThrow()
    expect(() => sanitizeAgentOutput('text <a href="http')).not.toThrow()
  })

  it('strips <img> with file:// src (LFI prevention)', () => {
    const out = sanitizeAgentOutput('<img src="file:///etc/passwd"/>')
    expect(out).not.toContain('file://')
    expect(out).not.toContain('<img')
  })

  it('strips <img> with data: src from agent (only ref form trusted)', () => {
    // data: 协议本身合法，但只能由 resolveRefsToDataUris 在 sanitize 之后产生；
    // agent 直接写 data: 视为不可信
    const out = sanitizeAgentOutput(
      '<img src="data:image/png;base64,iVBOR..."/>'
    )
    expect(out).not.toContain('data:image')
    expect(out).not.toContain('<img')
  })

  it('strips <img> with javascript:/koishi:/exotic schemes', () => {
    expect(sanitizeAgentOutput('<img src="javascript:alert(1)"/>')).not.toContain('javascript')
    expect(sanitizeAgentOutput('<img src="koishi:foo"/>')).not.toContain('<img')
    expect(sanitizeAgentOutput('<img src="ftp://x"/>')).not.toContain('<img')
  })

  it('keeps <img> with http(s) src', () => {
    const ok1 = sanitizeAgentOutput('<img src="https://x.com/a.png"/>')
    expect(ok1).toContain('<img')
    expect(ok1).toContain('https://x.com/a.png')
    const ok2 = sanitizeAgentOutput('<img src="http://x.com/a.png"/>')
    expect(ok2).toContain('http://x.com/a.png')
  })

  it('keeps <img ref="..."/> placeholder (no src) as trusted', () => {
    const out = sanitizeAgentOutput('<img ref="abc123def456"/>')
    expect(out).toContain('<img')
    expect(out).toContain('ref="abc123def456"')
  })

  it('strips <a> with file:// href but keeps the link text', () => {
    const out = sanitizeAgentOutput(
      '点 <a href="file:///etc/passwd">这里</a> 看'
    )
    expect(out).not.toContain('file://')
    expect(out).not.toContain('<a')
    expect(out).toContain('这里')
  })

  it('strips <a> with javascript: href', () => {
    const out = sanitizeAgentOutput(
      '<a href="javascript:alert(1)">click</a>'
    )
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('<a')
    expect(out).toContain('click')
  })

  it('keeps <a> with http(s) href', () => {
    const out = sanitizeAgentOutput(
      '<a href="https://example.com">看这里</a>'
    )
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('看这里')
  })

  it('strips internal protocol elements entirely (no children kept)', () => {
    // chat_info / user_message / interrupt_notice / interrupted / silent
    expect(
      sanitizeAgentOutput('<chat_info>{"user_id":1}</chat_info>')
    ).toBe('')
    expect(
      sanitizeAgentOutput('hi <user_message>secret</user_message> there')
    ).not.toContain('secret')
    expect(
      sanitizeAgentOutput('text <interrupt_notice>...</interrupt_notice>')
    ).not.toContain('interrupt_notice')
    expect(sanitizeAgentOutput('a<interrupted/>b')).toBe('ab')
    expect(sanitizeAgentOutput('<silent/>')).toBe('')
  })

  it('strips <silent/> mid-stream chunks too', () => {
    // 多模型流式分片可能让 <silent/> 出现在不同位置
    expect(sanitizeAgentOutput('hello<silent/>')).toBe('hello')
    expect(sanitizeAgentOutput('<silent/>tail')).toBe('tail')
  })
})
