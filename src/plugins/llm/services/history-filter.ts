export type HistoryRole = 'system' | 'user' | 'assistant' | 'tool'

export interface HistoryRow {
  role: HistoryRole
  content: string
  reasoning_content?: string
  tool_calls?: string             // JSON string
  tool_call_id?: string
  tool_name?: string
}

interface Turn {
  user: HistoryRow
  intermediate: HistoryRow[]      // assistant(tool_calls) + tool messages
  finalAssistant: HistoryRow | null
}

function isAssistantWithToolCalls(row: HistoryRow): boolean {
  if (row.role !== 'assistant') return false
  if (!row.tool_calls) return false
  try {
    const arr = JSON.parse(row.tool_calls)
    return Array.isArray(arr) && arr.length > 0
  } catch {
    return false
  }
}

function isPlainAssistant(row: HistoryRow): boolean {
  return row.role === 'assistant' && !isAssistantWithToolCalls(row)
}

function* groupTurns(rows: HistoryRow[]): Generator<Turn> {
  let i = 0
  while (i < rows.length) {
    const row = rows[i]
    if (row.role !== 'user') {
      i++
      continue
    }
    const turn: Turn = { user: row, intermediate: [], finalAssistant: null }
    i++
    while (i < rows.length && rows[i].role !== 'user') {
      const next = rows[i]
      if (isPlainAssistant(next)) {
        turn.finalAssistant = next
        i++
        break
      }
      turn.intermediate.push(next)
      i++
    }
    yield turn
  }
}

function isValidTurn(turn: Turn): boolean {
  if (!turn.finalAssistant) return false
  // intermediate 必须成对：每个 assistant(tool_calls) 后都有对应的 tool 响应
  const pendingIds = new Set<string>()
  for (const row of turn.intermediate) {
    if (isAssistantWithToolCalls(row)) {
      try {
        const calls = JSON.parse(row.tool_calls!)
        for (const c of calls) pendingIds.add(c.id)
      } catch {
        return false
      }
    } else if (row.role === 'tool') {
      if (!row.tool_call_id || !pendingIds.has(row.tool_call_id)) return false
      pendingIds.delete(row.tool_call_id)
    } else {
      return false
    }
  }
  return pendingIds.size === 0
}

export function groupAndTrimHistory(
  rows: HistoryRow[],
  userTurnLimit: number
): HistoryRow[] {
  if (userTurnLimit <= 0) return []
  const turns: Turn[] = []
  for (const t of groupTurns(rows)) {
    if (isValidTurn(t)) turns.push(t)
  }
  const kept = turns.slice(-userTurnLimit)
  const out: HistoryRow[] = []
  for (const t of kept) {
    out.push(t.user)
    out.push(...t.intermediate)
    if (t.finalAssistant) out.push(t.finalAssistant)
  }
  return out
}
