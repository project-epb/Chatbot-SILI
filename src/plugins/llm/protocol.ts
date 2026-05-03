/**
 * Protocol elements shared between the orchestration system and the agent.
 *
 * Centralized so any rename / addition is one-stop, and so plain `grep`
 * across the codebase finds every reference. Code that builds envelope
 * strings or detects markers should import from here, never hardcode the
 * raw `<...>` strings.
 *
 * Categories:
 *  - **Element type names**: bare `chat_info`, `user_message`, etc.
 *    Used by `output-filter.ts` (sanitize allow/deny lists) and any
 *    `h.parse(...).type` comparison.
 *  - **Self-closing markers**: full `<silent/>` strings the agent emits
 *    inline. Used by agent-loop and stream-splitter for detection.
 *  - **Block tags**: paired open/close strings used to wrap envelope
 *    blocks in user messages.
 */

/** Element type names (`element.type` after `h.parse`). */
export const PROTOCOL_ELEMENT_TYPES = {
  /** Per-turn metadata (user_id, time, platform). System-injected. */
  CHAT_INFO: 'chat_info',
  /** The actual user-typed text inside a chat turn envelope. */
  USER_MESSAGE: 'user_message',
  /** One-shot block telling the agent it was just interrupted. */
  INTERRUPT_NOTICE: 'interrupt_notice',
  /** Marker appended to assistant content when its turn was cut short. */
  INTERRUPTED: 'interrupted',
  /** Magic string the agent emits when it chooses silence. */
  SILENT: 'silent',
  /** Agent-inserted message-break point (drives stream chunk boundaries). */
  MSG_BREAK: 'msg_break',
} as const

/** Full self-closing marker strings. */
export const PROTOCOL_MARKERS = {
  INTERRUPTED: '<interrupted/>',
  SILENT: '<silent/>',
  MSG_BREAK: '<msg_break/>',
} as const

/** Paired open/close tags for envelope blocks. */
export const PROTOCOL_TAGS = {
  CHAT_INFO: { open: '<chat_info>', close: '</chat_info>' },
  USER_MESSAGE: { open: '<user_message>', close: '</user_message>' },
  INTERRUPT_NOTICE: {
    open: '<interrupt_notice>',
    close: '</interrupt_notice>',
  },
} as const

/**
 * Element types that are protocol-only — must never reach the user.
 * `output-filter.ts` consumes this set to drop the elements (children
 * included) regardless of placement.
 */
export const PROTOCOL_ONLY_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  PROTOCOL_ELEMENT_TYPES.CHAT_INFO,
  PROTOCOL_ELEMENT_TYPES.USER_MESSAGE,
  PROTOCOL_ELEMENT_TYPES.INTERRUPT_NOTICE,
  PROTOCOL_ELEMENT_TYPES.INTERRUPTED,
  PROTOCOL_ELEMENT_TYPES.SILENT,
  PROTOCOL_ELEMENT_TYPES.MSG_BREAK,
])
