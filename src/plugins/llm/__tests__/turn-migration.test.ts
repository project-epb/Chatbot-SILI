import { describe, expect, it } from 'vitest'

import { assignTurnNumbers } from '../services/turn-migration'

describe('assignTurnNumbers', () => {
  it('basic: user → assistant, single turn', () => {
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'user', time: 100 },
      { id: 2, conversation_id: 'c', role: 'assistant', time: 200 },
    ])
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 1, intra_turn_seq: 1 },
    ])
  })

  it('two consecutive turns', () => {
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'user', time: 100 },
      { id: 2, conversation_id: 'c', role: 'assistant', time: 200 },
      { id: 3, conversation_id: 'c', role: 'user', time: 300 },
      { id: 4, conversation_id: 'c', role: 'assistant', time: 400 },
    ])
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 1, intra_turn_seq: 1 },
      { id: 3, turn_number: 2, intra_turn_seq: 0 },
      { id: 4, turn_number: 2, intra_turn_seq: 1 },
    ])
  })

  it('turn with tool calls (assistant + tool + final assistant)', () => {
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'user', time: 100 },
      // assistant with tool_calls — must include tool_calls field for the
      // classifier to count it as intermediate (not plain final).
      {
        id: 2,
        conversation_id: 'c',
        role: 'assistant',
        time: 200,
        tool_calls: '[{"id":"x","name":"foo","arguments":{}}]',
      },
      { id: 3, conversation_id: 'c', role: 'tool', time: 300 },
      { id: 4, conversation_id: 'c', role: 'assistant', time: 400 }, // final
      { id: 5, conversation_id: 'c', role: 'user', time: 500 },
      { id: 6, conversation_id: 'c', role: 'assistant', time: 600 },
    ])
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 1, intra_turn_seq: 1 },
      { id: 3, turn_number: 1, intra_turn_seq: 2 },
      { id: 4, turn_number: 1, intra_turn_seq: 3 },
      { id: 5, turn_number: 2, intra_turn_seq: 0 },
      { id: 6, turn_number: 2, intra_turn_seq: 1 },
    ])
  })

  it('the interrupt scenario (the original Fiber bug) — FIFO recovers correct pairing', () => {
    // Real-world wall-clock order from a race: user_A came first, then
    // user_B interrupted while old chat was streaming, then old chat's
    // interrupted assistant landed, then chat B's final assistant landed.
    // Time-asc order: [user_A, user_B, asst<int A>, asst B]
    //
    // FIFO heuristic pairs the EARLIEST waiting user with the FIRST
    // arriving plain assistant, which exactly matches the real
    // chat-invocation -> record relationship.
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'user', time: 100 }, // user_A "再给 fiber"
      { id: 2, conversation_id: 'c', role: 'user', time: 200 }, // user_B "听困了"
      { id: 3, conversation_id: 'c', role: 'assistant', time: 201 }, // asst<int A>
      { id: 4, conversation_id: 'c', role: 'assistant', time: 250 }, // asst B
    ])
    // turn 1: user_A (seq 0) + asst<int A> (seq 1) — FIFO popped user_A first
    // turn 2: user_B (seq 0) + asst B (seq 1)
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 2, intra_turn_seq: 0 },
      { id: 3, turn_number: 1, intra_turn_seq: 1 },
      { id: 4, turn_number: 2, intra_turn_seq: 1 },
    ])
  })

  it('FIFO across deeper interleaving (3-way race)', () => {
    // Three users in a row, then three plain assistants — pair in order
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'user', time: 100 },
      { id: 2, conversation_id: 'c', role: 'user', time: 200 },
      { id: 3, conversation_id: 'c', role: 'user', time: 300 },
      { id: 4, conversation_id: 'c', role: 'assistant', time: 301 }, // -> turn 1
      { id: 5, conversation_id: 'c', role: 'assistant', time: 302 }, // -> turn 2
      { id: 6, conversation_id: 'c', role: 'assistant', time: 303 }, // -> turn 3
    ])
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 2, intra_turn_seq: 0 },
      { id: 3, turn_number: 3, intra_turn_seq: 0 },
      { id: 4, turn_number: 1, intra_turn_seq: 1 },
      { id: 5, turn_number: 2, intra_turn_seq: 1 },
      { id: 6, turn_number: 3, intra_turn_seq: 1 },
    ])
  })

  it('tool intermediates always belong to the most recently opened turn', () => {
    // After user_A opens turn 1, an assistant<tool_calls> + tool result
    // come in — they must land in turn 1, not later turns. Then user_B
    // arrives, opening turn 2, and the next plain assistant pops user_A
    // off the FIFO (FIFO matched), giving turn 1 a final.
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'user', time: 100 },
      {
        id: 2,
        conversation_id: 'c',
        role: 'assistant',
        time: 110,
        tool_calls: '[{"id":"x","name":"foo","arguments":{}}]',
      },
      { id: 3, conversation_id: 'c', role: 'tool', time: 120 },
      { id: 4, conversation_id: 'c', role: 'user', time: 200 }, // user_B interrupts before final assistant arrives
      { id: 5, conversation_id: 'c', role: 'assistant', time: 210 }, // FIFO -> user_A's final
      { id: 6, conversation_id: 'c', role: 'assistant', time: 220 }, // FIFO -> user_B's final
    ])
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 1, intra_turn_seq: 1 },
      { id: 3, turn_number: 1, intra_turn_seq: 2 },
      { id: 4, turn_number: 2, intra_turn_seq: 0 },
      { id: 5, turn_number: 1, intra_turn_seq: 3 },
      { id: 6, turn_number: 2, intra_turn_seq: 1 },
    ])
  })

  it('orphan assistant before any user gets placeholder turn 1', () => {
    const out = assignTurnNumbers([
      { id: 1, conversation_id: 'c', role: 'assistant', time: 100 },
      { id: 2, conversation_id: 'c', role: 'user', time: 200 },
      { id: 3, conversation_id: 'c', role: 'assistant', time: 300 },
    ])
    // First row is orphan → placeholder turn 1, seq 0
    // First user starts a new turn (turn 2), then assistant in same turn
    expect(out).toEqual([
      { id: 1, turn_number: 1, intra_turn_seq: 0 },
      { id: 2, turn_number: 2, intra_turn_seq: 0 },
      { id: 3, turn_number: 2, intra_turn_seq: 1 },
    ])
  })

  it('empty input', () => {
    expect(assignTurnNumbers([])).toEqual([])
  })
})
