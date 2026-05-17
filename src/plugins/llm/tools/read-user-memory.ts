import { type MemoryStore, byteLength } from '../services/memory'
import type { ToolDefinition } from '../providers/_base'

export const READ_USER_MEMORY_TOOL: ToolDefinition = {
  name: 'read_user_memory',
  description:
    '读取当前用户的长期记忆文档，按需调用：当话题涉及用户偏好、过往互动、或个人化判断时使用；闲聊和常识问答不需要调用。返回纯文本（多行 markdown），若无记忆返回 "(暂无长期记忆)"。' +
    '如果接下来打算调 `save_user_memory` 更新记忆，必须先调本工具——save 工具会校验 read-before-write。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
}

/**
 * Per-turn coordination state shared between read_user_memory and
 * save_user_memory. Set on the read path, consumed on the save path.
 */
export interface MemoryToolState {
  /** read_user_memory was called in the current turn */
  hasReadInTurn: boolean
  /**
   * `last_updated_at` observed at the most recent read; used as an
   * optimistic-lock token so save_user_memory can detect "memory was
   * modified after the read" (e.g. background fork ran between read
   * and save). 0 = no memory record existed yet.
   */
  lastSeenUpdatedAt: number
  /** save_user_memory has already committed in the current turn */
  savedThisTurn: boolean
}

/** Stable key under `ToolContext.turnState` for memory tools. */
export const MEMORY_TOOL_STATE_KEY = 'memory'

export function getMemoryToolState(
  turnState: Record<string, unknown>
): MemoryToolState {
  let s = turnState[MEMORY_TOOL_STATE_KEY] as MemoryToolState | undefined
  if (!s) {
    s = { hasReadInTurn: false, lastSeenUpdatedAt: 0, savedThisTurn: false }
    turnState[MEMORY_TOOL_STATE_KEY] = s
  }
  return s
}

/**
 * Pure helper for the read_user_memory tool — exists separately so it can be
 * unit-tested without spinning up a koishi context.
 *
 * Returns both the user-visible text and the `last_updated_at` timestamp;
 * the caller (handler) is expected to write the timestamp into
 * `MemoryToolState.lastSeenUpdatedAt` so save_user_memory can later use
 * it as an optimistic-lock token.
 *
 * If `hardLimit` is provided, a trailing usage line is appended so the
 * agent has a concrete sense of "how much room is left" before deciding
 * what's worth recording — abstract limits like "3300 字节" without a
 * current-usage anchor are easy for agents to misjudge.
 */
export async function runReadUserMemory(
  memory: Pick<MemoryStore, 'getMeta'>,
  platform: string,
  userId: string,
  options: { hardLimit?: number } = {}
): Promise<{ text: string; lastUpdatedAt: number }> {
  const meta = await memory.getMeta(platform, userId)
  const raw = meta?.content
  const lastUpdatedAt = meta?.last_updated_at ?? 0
  if (!raw || !raw.trim()) {
    return { text: '(暂无长期记忆)', lastUpdatedAt }
  }
  let text = raw
  if (options.hardLimit && options.hardLimit > 0) {
    // Size matches what save_user_memory / memory-fork actually persist
    // (trailing whitespace trimmed) — keeping the two paths consistent
    // so the agent's mental model isn't off by a few bytes.
    const trimmed = raw.replace(/\s+$/, '')
    const size = byteLength(trimmed)
    const pct = Math.round((size / options.hardLimit) * 100)
    text = `${trimmed}\n\n(已用 ${size} / ${options.hardLimit} 字节，约 ${pct}% 配额)`
  }
  return { text, lastUpdatedAt }
}
