/**
 * Pure parser for a koishi-flavored BBCode dialect:
 *
 *     [ns:tag attr="value" attr2="value2"]            // self-closing
 *     [ns:tag attr="value"]inner text[/ns:tag]         // paired
 *
 * Design tenets:
 *  - **Zero koishi / LLM dependency.** Just regex + string slicing.
 *    Caller (e.g. an LLM output sanitizer) applies semantic policy on
 *    top of the structural nodes returned.
 *  - **Namespace prefix is the disambiguator.** Default `koishi:` is
 *    distinctive enough to never collide with natural prose or markdown.
 *  - **Paired vs self-closing is caller-declared.** The parser doesn't
 *    guess. Tags listed in `pairedTags` look for a matching `[/ns:tag]`;
 *    everything else is self-closing. A paired tag without a matching
 *    close is **not recognized as an element** — it stays as text. This
 *    keeps streaming-cut output predictable: half a paired tag never
 *    surfaces as a malformed element to downstream consumers.
 *  - **`]` inside `"..."` attribute values is allowed.** The attribute
 *    region alternates between unquoted non-`]` runs and complete
 *    quoted strings.
 *  - **Unknown self-closing tags are still recognized** as elements with
 *    `tag` set to whatever the source had. Caller decides what to do
 *    with unrecognized tags (escape, drop, etc.).
 *
 * Non-goals:
 *  - No nesting of paired tags. AI rarely writes nested links.
 *  - No single-quoted attributes (`[tag attr='v']`). AI almost always
 *    emits double-quoted.
 *  - No attribute-less paired close form (`[tag]inner[/tag]`); the open
 *    must include the tag word boundary so closing `]` is unambiguous.
 */

export interface BBCodeText {
  kind: 'text'
  content: string
}

export interface BBCodeElement {
  kind: 'element'
  /** Tag name without the namespace prefix (e.g. `img`, `a`). */
  tag: string
  /** Parsed attributes. Empty object if none. */
  attrs: Record<string, string>
  /**
   * Inner text for paired elements (between open and close brackets).
   * `undefined` for self-closing elements.
   */
  inner?: string
  /** Full source span including brackets — useful for "escape literally". */
  raw: string
}

export type BBCodeNode = BBCodeText | BBCodeElement

export interface ParseOptions {
  /**
   * Tag names that require a paired close `[/ns:tag]`. Everything else
   * is treated as self-closing `[ns:tag attrs]`. Order doesn't matter.
   */
  pairedTags?: ReadonlySet<string>
  /**
   * Namespace prefix. Default `koishi`. The resulting tag opener is
   * `[<namespace>:tagname ...]`. Set to `''` to match any `[tagname ...]`
   * without a colon prefix (not recommended — collision risk).
   */
  namespace?: string
}

const DEFAULT_NS = 'koishi'
// Attribute-region matcher: alternate between non-]-non-" runs and full
// "..." strings. This lets `]` inside an attr value (e.g. URL containing
// a bracket) pass through without prematurely closing the tag.
const ATTRS_INNER = String.raw`(?:[^\]"]+|"[^"]*")*`

/**
 * Parse `source` into a flat list of text / element nodes, in source
 * order. The original source is recoverable as `nodes.map(n => n.kind ===
 * 'text' ? n.content : n.raw).join('')`.
 */
export function parseKoishiBBCode(
  source: string,
  opts: ParseOptions = {}
): BBCodeNode[] {
  if (!source) return []
  const ns = opts.namespace ?? DEFAULT_NS
  const nsPrefix = ns ? `${escapeRegex(ns)}:` : ''
  const paired = opts.pairedTags ?? new Set<string>()
  const re = buildPattern(nsPrefix, paired)

  const nodes: BBCodeNode[] = []
  let lastIdx = 0

  for (const m of source.matchAll(re)) {
    const start = m.index!
    if (start > lastIdx) {
      nodes.push({ kind: 'text', content: source.slice(lastIdx, start) })
    }

    const raw = m[0]
    const classified = classify(raw, nsPrefix, paired)
    if (classified) {
      nodes.push(classified)
    } else {
      // Defensive: matched the regex but classify failed somehow. Treat
      // as literal text so we never drop bytes.
      nodes.push({ kind: 'text', content: raw })
    }
    lastIdx = start + raw.length
  }

  if (lastIdx < source.length) {
    nodes.push({ kind: 'text', content: source.slice(lastIdx) })
  }

  return nodes
}

/**
 * Convenience: fetch an attribute value from a parsed element. Lookup is
 * case-insensitive on the attribute name to match HTML convention.
 */
export function getAttr(
  el: BBCodeElement,
  name: string
): string | undefined {
  const lc = name.toLowerCase()
  for (const k of Object.keys(el.attrs)) {
    if (k.toLowerCase() === lc) return el.attrs[k]
  }
  return undefined
}

// ----------- internals -----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a single regex matching every recognized bracket pattern. Paired
 * tags are matched as a single span (open + inner + close); self-closing
 * tags as just the open bracket. Order matters — paired forms must come
 * first so the regex engine prefers them over the self-closing fallback
 * which would otherwise stop at the open `]`.
 */
function buildPattern(
  nsPrefix: string,
  paired: ReadonlySet<string>
): RegExp {
  const parts: string[] = []

  for (const tag of paired) {
    const t = escapeRegex(tag)
    parts.push(
      String.raw`\[${nsPrefix}${t}\b${ATTRS_INNER}\][\s\S]*?\[\/${nsPrefix}${t}\]`
    )
  }

  // Self-closing fallback: any namespaced tag. Tag name is captured for
  // classification; the inner-attrs region uses the same ]-in-quotes-safe
  // alternation as paired.
  parts.push(
    String.raw`\[${nsPrefix}[a-zA-Z][a-zA-Z0-9_-]*\b${ATTRS_INNER}\]`
  )

  return new RegExp(parts.join('|'), 'gi')
}

/**
 * Inspect a raw matched substring and turn it into a BBCodeElement.
 * Returns null if the match shape isn't recognizable (shouldn't happen
 * given the builder regex, but we stay defensive).
 */
function classify(
  raw: string,
  nsPrefix: string,
  paired: ReadonlySet<string>
): BBCodeElement | null {
  // Tag name lives immediately after `[ns:` until the next whitespace
  // or `]`.
  const headRe = new RegExp(
    `^\\[${nsPrefix}([a-zA-Z][a-zA-Z0-9_-]*)\\b`,
    'i'
  )
  const headMatch = raw.match(headRe)
  if (!headMatch) return null
  const tag = headMatch[1]

  const isPaired = paired.has(tag.toLowerCase())
  if (isPaired) {
    const pairedRe = new RegExp(
      `^\\[${nsPrefix}${escapeRegex(tag)}\\b(${ATTRS_INNER})\\]([\\s\\S]*?)\\[\\/${nsPrefix}${escapeRegex(tag)}\\]$`,
      'i'
    )
    const m = raw.match(pairedRe)
    if (!m) return null
    return {
      kind: 'element',
      tag,
      attrs: parseAttrs(m[1] ?? ''),
      inner: m[2] ?? '',
      raw,
    }
  }

  // Self-closing: everything between tag name and final `]` is attr region.
  const selfRe = new RegExp(
    `^\\[${nsPrefix}${escapeRegex(tag)}\\b(${ATTRS_INNER})\\]$`,
    'i'
  )
  const m = raw.match(selfRe)
  if (!m) return null
  return {
    kind: 'element',
    tag,
    attrs: parseAttrs(m[1] ?? ''),
    raw,
  }
}

/**
 * Parse the attribute region of a tag (the bit between `tag` and `]`).
 * Recognized form: `key="value"`, space-separated, double-quoted. Values
 * are stored verbatim — no entity decoding (caller decides).
 */
function parseAttrs(region: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z][a-zA-Z0-9_-]*)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(region)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}
