// Import directly from satori/element rather than re-exporting through
// koishi: pulling `h` from 'koishi' drags in the @koishijs/loader entry
// graph, which fails to construct under vitest. The runtime `h` is the
// same Element namespace either way.
import h from '@satorijs/element'

import { PROTOCOL_ONLY_ELEMENT_TYPES } from './protocol'

/**
 * Element types the agent is allowed to emit to users. Anything outside this
 * set gets stripped (children kept as text) before the message reaches
 * `session.sendQueued` — so even if the model writes `<at id="..."/>` to
 * spam-mention someone, the runtime never honors it.
 *
 * Notes:
 * - `text` is the satori synthetic node type for plain string segments
 * - `quote` is added by us (not the agent) but flows through this same path,
 *   so it must be allowed
 * - markdown shorthand (`b`/`i`/`em`/`strong`/`p`/`br`) is permitted in case
 *   the model produces inline html-ish formatting
 */
export const ALLOWED_OUTGOING_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'a',
  'img',
  'p',
  'br',
  'b',
  'i',
  'em',
  'strong',
  'quote',
])


/**
 * URL schemes accepted in `<img src="...">` and `<a href="...">`. We do **not**
 * allow:
 * - `file://` — would read host filesystem, classic LFI
 * - `data:` — could embed arbitrary payloads; image ref restoration produces
 *   `data:` later, but that happens AFTER sanitize so isn't checked here
 * - `javascript:` / `koishi:` / anything else exotic
 */
function isSafeHttpUrl(url: string | undefined): boolean {
  if (!url) return false
  return /^https?:\/\//i.test(url)
}

/**
 * Parse `text` as koishi elements and drop any element whose type is not on
 * the allow-list. Disallowed elements are replaced by their children (so
 * `<at id="123">name</at>` becomes `name`, not empty). Falls back to the
 * original text on parse errors so streaming chunks that happen to split a
 * tag don't get silently dropped.
 *
 * Beyond the type allow-list, `<img>` and `<a>` get an extra URL-scheme
 * check: only `http(s)://` is accepted on `src`/`href`. `<img ref="..."/>`
 * (our placeholder, no src) is recognized and passed through — the
 * post-sanitize step `resolveRefsToDataUris` substitutes a `data:` URI
 * we ourselves produced, which is trusted.
 */
export function sanitizeAgentOutput(text: string): string {
  if (!text) return text
  try {
    const elements = h.parse(text)
    const filtered = h.transform(elements, (e) => {
      // Internal protocol elements: drop without preserving children
      if (PROTOCOL_ONLY_ELEMENT_TYPES.has(e.type)) return []
      if (e.type === 'img') {
        const attrs = (e.attrs ?? {}) as Record<string, unknown>
        const ref = typeof attrs.ref === 'string' ? attrs.ref : undefined
        const src = typeof attrs.src === 'string' ? attrs.src : undefined
        // Pure ref placeholder: trust, will be resolved later
        if (ref && !src) return true
        // Real src: must be http(s)
        if (isSafeHttpUrl(src)) return true
        // Otherwise drop the element (no children for self-closing img)
        return e.children
      }
      if (e.type === 'a') {
        const attrs = (e.attrs ?? {}) as Record<string, unknown>
        const href = typeof attrs.href === 'string' ? attrs.href : undefined
        if (isSafeHttpUrl(href)) return true
        // Bad href: keep the link text, drop the wrapper
        return e.children
      }
      if (ALLOWED_OUTGOING_ELEMENT_TYPES.has(e.type)) return true
      return e.children
    })
    return filtered.map((e) => e.toString()).join('')
  } catch {
    return text
  }
}
