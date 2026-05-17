import { describe, it, expect } from 'vitest'
import {
  type BBCodeElement,
  type BBCodeNode,
  getAttr,
  parseKoishiBBCode,
} from '../utils/koishi-bbcode'

/** Tiny helper: extract only the elements from a parse result. */
function elements(nodes: BBCodeNode[]): BBCodeElement[] {
  return nodes.filter((n): n is BBCodeElement => n.kind === 'element')
}

/** Tiny helper: extract the text content joined into one string. */
function texts(nodes: BBCodeNode[]): string {
  return nodes
    .filter((n): n is { kind: 'text'; content: string } => n.kind === 'text')
    .map((n) => n.content)
    .join('')
}

describe('parseKoishiBBCode', () => {
  describe('empty / boundary', () => {
    it('returns [] for empty string', () => {
      expect(parseKoishiBBCode('')).toEqual([])
    })

    it('returns single text node for plain prose', () => {
      const nodes = parseKoishiBBCode('hello world')
      expect(nodes).toEqual([{ kind: 'text', content: 'hello world' }])
    })

    it('preserves raw <>& in text — does NOT touch them', () => {
      // Parser is purely structural; entity policy belongs to caller.
      const src = 'a < b & c > d'
      expect(parseKoishiBBCode(src)).toEqual([{ kind: 'text', content: src }])
    })
  })

  describe('self-closing tags', () => {
    it('recognizes [koishi:img src="..."]', () => {
      const nodes = parseKoishiBBCode('[koishi:img src="https://x.com/a.png"]')
      const el = elements(nodes)[0]
      expect(el.tag).toBe('img')
      expect(el.attrs.src).toBe('https://x.com/a.png')
      expect(el.inner).toBeUndefined()
      expect(el.raw).toBe('[koishi:img src="https://x.com/a.png"]')
    })

    it('recognizes self-closing protocol markers', () => {
      const nodes = parseKoishiBBCode('a[koishi:msg_break]b')
      expect(elements(nodes).map((e) => e.tag)).toEqual(['msg_break'])
      expect(texts(nodes)).toBe('ab')
    })

    it('recognizes ANY tag name (unknown tags still parse as elements)', () => {
      // Policy layer decides what to do with unknown tags.
      const nodes = parseKoishiBBCode('[koishi:wat]')
      expect(elements(nodes)).toHaveLength(1)
      expect(elements(nodes)[0].tag).toBe('wat')
    })

    it('captures multiple attributes', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:img src="https://x" alt="hi" width="100"]'
      )
      const el = elements(nodes)[0]
      expect(el.attrs).toEqual({
        src: 'https://x',
        alt: 'hi',
        width: '100',
      })
    })

    it('captures element with no attributes', () => {
      const nodes = parseKoishiBBCode('[koishi:foo]')
      const el = elements(nodes)[0]
      expect(el.attrs).toEqual({})
    })

    it('allows ] inside "..." attribute values', () => {
      // The trickiest source-level regex case.
      const nodes = parseKoishiBBCode(
        '[koishi:img src="https://x/path-]-suffix"]'
      )
      const el = elements(nodes)[0]
      expect(el.attrs.src).toBe('https://x/path-]-suffix')
      expect(el.raw).toBe('[koishi:img src="https://x/path-]-suffix"]')
    })

    it('allows [ inside attribute values', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:img src="https://x/path-[-suffix"]'
      )
      const el = elements(nodes)[0]
      expect(el.attrs.src).toBe('https://x/path-[-suffix')
    })
  })

  describe('paired tags', () => {
    it('matches paired form when tag is in pairedTags set', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:a href="https://x"]click[/koishi:a]',
        { pairedTags: new Set(['a']) }
      )
      const el = elements(nodes)[0]
      expect(el.tag).toBe('a')
      expect(el.attrs.href).toBe('https://x')
      expect(el.inner).toBe('click')
    })

    it('preserves literal [bracketed text] inside paired inner', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:a href="https://x"]看 [这里] 链接[/koishi:a]',
        { pairedTags: new Set(['a']) }
      )
      expect(elements(nodes)[0].inner).toBe('看 [这里] 链接')
    })

    it('preserves literal [/markdown]-like text inside paired inner', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:a href="https://x"]like [/something] foo[/koishi:a]',
        { pairedTags: new Set(['a']) }
      )
      expect(elements(nodes)[0].inner).toBe('like [/something] foo')
    })

    it('unclosed paired tag is NOT recognized — stays as text', () => {
      // Streaming-cut safety: a half tag never surfaces as a malformed
      // element to downstream consumers.
      const nodes = parseKoishiBBCode(
        '[koishi:a href="https://x"]forgot close',
        { pairedTags: new Set(['a']) }
      )
      expect(elements(nodes)).toHaveLength(0)
      expect(texts(nodes)).toBe('[koishi:a href="https://x"]forgot close')
    })

    it('paired tag falls back to text if its tag is NOT in pairedTags', () => {
      // Without telling the parser `a` is paired, it tries self-closing
      // and matches just the open tag; the close-tag remains as text.
      const nodes = parseKoishiBBCode(
        '[koishi:a href="https://x"]click[/koishi:a]',
        { /* no pairedTags */ }
      )
      // Open tag parsed as self-close
      expect(elements(nodes).map((e) => e.tag)).toEqual(['a'])
      // Rest (including [/koishi:a]) becomes text
      expect(texts(nodes)).toContain('[/koishi:a]')
    })
  })

  describe('mixed text + elements + boundary preservation', () => {
    it('keeps surrounding text intact', () => {
      const nodes = parseKoishiBBCode(
        '前 [koishi:img src="https://x"] 后',
        {}
      )
      expect(nodes).toEqual([
        { kind: 'text', content: '前 ' },
        expect.objectContaining({ kind: 'element', tag: 'img' }),
        { kind: 'text', content: ' 后' },
      ])
    })

    it('source is byte-perfectly recoverable from nodes', () => {
      const src =
        '前面 [koishi:img src="https://x.png"] 中间 [koishi:a href="https://y"]link[/koishi:a] 后面'
      const nodes = parseKoishiBBCode(src, { pairedTags: new Set(['a']) })
      const recovered = nodes
        .map((n) => (n.kind === 'text' ? n.content : n.raw))
        .join('')
      expect(recovered).toBe(src)
    })

    it('handles three consecutive elements with no gap text', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:msg_break][koishi:img src="https://x"][koishi:silent]'
      )
      expect(elements(nodes).map((e) => e.tag)).toEqual([
        'msg_break',
        'img',
        'silent',
      ])
      expect(texts(nodes)).toBe('')
    })
  })

  describe('namespace option', () => {
    it('respects custom namespace', () => {
      const nodes = parseKoishiBBCode('[myns:thing attr="x"]', {
        namespace: 'myns',
      })
      expect(elements(nodes)[0].tag).toBe('thing')
    })

    it('ignores tags with wrong namespace', () => {
      const nodes = parseKoishiBBCode('[other:foo]', { namespace: 'koishi' })
      expect(elements(nodes)).toHaveLength(0)
      expect(texts(nodes)).toBe('[other:foo]')
    })

    it('namespace="" matches bare [tag] without prefix', () => {
      const nodes = parseKoishiBBCode('[foo bar="x"]', { namespace: '' })
      expect(elements(nodes)[0].tag).toBe('foo')
      expect(elements(nodes)[0].attrs.bar).toBe('x')
    })
  })

  describe('streaming-cut safety', () => {
    it('half open-bracket is text', () => {
      expect(elements(parseKoishiBBCode('[koishi:img src="https://x'))).toEqual(
        []
      )
    })

    it('half close-bracket of paired tag is text', () => {
      const nodes = parseKoishiBBCode(
        '[koishi:a href="https://x"]click[/koishi:a',
        { pairedTags: new Set(['a']) }
      )
      expect(elements(nodes)).toHaveLength(0)
    })

    it('does not throw on garbage input', () => {
      expect(() =>
        parseKoishiBBCode('[][koishi[koishi:]]][/foo')
      ).not.toThrow()
    })
  })

  describe('getAttr helper', () => {
    it('finds attribute case-insensitively', () => {
      const nodes = parseKoishiBBCode('[koishi:img SRC="https://x"]')
      const el = elements(nodes)[0]
      expect(getAttr(el, 'src')).toBe('https://x')
      expect(getAttr(el, 'SRC')).toBe('https://x')
    })

    it('returns undefined when missing', () => {
      const nodes = parseKoishiBBCode('[koishi:img]')
      expect(getAttr(elements(nodes)[0], 'src')).toBeUndefined()
    })
  })
})
