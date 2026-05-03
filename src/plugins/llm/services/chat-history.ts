import type { Context } from 'koishi'

import { type HistoryRow, groupAndTrimHistory } from '../history-filter'
import type { ChatMessage, ToolCall } from '../providers/_base'

/**
 * Read & shape persisted chat history into the ChatMessage[] format the
 * LLM provider expects. Implements a two-phase approach:
 *
 *  1. Pull the most recent rows by descending time (cap to 200 to avoid
 *     unbounded queries even when the caller requests a large turn limit).
 *  2. Pass them through groupAndTrimHistory which understands turn
 *     boundaries (1 user + N assistant tool_calls + N tool + 1 final
 *     assistant) and returns the most recent N completed turns.
 *
 * `reasoning_content` is always populated (even with empty string) so the
 * provider layer can decide whether to keep it based on the target model.
 */
export class ChatHistoryService {
  constructor(private readonly ctx: Context) {}

  async getById(
    conversation_id: string,
    limit = 10
  ): Promise<ChatMessage[]> {
    const userTurnLimit = Math.max(0, Math.floor(limit))
    if (!userTurnLimit) return []

    // 一个回合最多 1 user + N assistant(tool_calls) + N tool + 1 final assistant
    const queryLimit = Math.min(200, userTurnLimit * 8 + 20)

    const raw = (await this.ctx.database.get(
      'openai_chat',
      { conversation_id },
      {
        sort: { time: 'desc' },
        limit: queryLimit,
        fields: [
          'content',
          'role',
          'reasoning_content',
          'tool_calls',
          'tool_call_id',
          'tool_name',
        ],
      }
    )) as Array<HistoryRow & { reasoning_content?: string }> | null

    const rowsAsc = (raw ?? []).slice().reverse()
    const trimmed = groupAndTrimHistory(rowsAsc, userTurnLimit)

    return trimmed.map((row): ChatMessage => {
      if (row.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: row.tool_call_id ?? '',
          tool_name: row.tool_name ?? '',
          content: row.content,
        }
      }
      if (row.role === 'assistant') {
        const tool_calls = row.tool_calls
          ? (JSON.parse(row.tool_calls) as ToolCall[])
          : undefined
        return {
          role: 'assistant',
          content: row.content,
          tool_calls,
          reasoning_content: row.reasoning_content ?? '',
        }
      }
      return { role: row.role as 'user' | 'system', content: row.content }
    })
  }
}
