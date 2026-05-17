/**
 * Protocol elements shared between the orchestration system and the agent.
 *
 * Centralized so any rename / addition is one-stop, and so plain `grep`
 * across the codebase finds every reference.
 *
 * Format split — important to understand:
 *  - **Inbound (system → agent)** uses `<chat_info>...</chat_info>` XML
 *    style envelope. These never reach the chat platform; they only exist
 *    in the agent's message context where AI is good at reading XML.
 *  - **Outbound (agent → us → chat platform)** uses `[koishi:...]`
 *    bracket form for any protocol marker or real element the agent wants
 *    rendered. The sanitizer h.text()-escapes the *entire* agent output
 *    by default; only bracket-form patterns get lifted as elements or
 *    dropped as markers. This means raw `<` `>` in agent text never
 *    collide with our protocol — both can coexist because the protocol
 *    doesn't use angle brackets at all on the outbound side.
 *
 * Categories:
 *  - **Element type names**: bare `chat_info`, `user_message`, etc.
 *    Used for `h.parse(...).type` comparison on inbound envelope.
 *  - **Self-closing markers**: full `[koishi:silent]` strings the agent
 *    emits inline. Used by agent-loop and stream-splitter for detection.
 *  - **Block tags** (inbound only): paired open/close XML strings used
 *    to wrap envelope blocks in user messages.
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

/**
 * Full marker strings emitted by the agent on the outbound side. Bracket
 * form (`[koishi:xxx]`) deliberately avoids angle brackets so it never
 * collides with raw `<` / `>` in agent prose — the sanitizer h.text()-
 * escapes everything that doesn't match a `[koishi:...]` pattern, so the
 * protocol and natural text coexist without parsing ambiguity.
 */
export const PROTOCOL_MARKERS = {
  INTERRUPTED: '[koishi:interrupted]',
  SILENT: '[koishi:silent]',
  MSG_BREAK: '[koishi:msg_break]',
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
