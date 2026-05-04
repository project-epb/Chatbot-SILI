import { describe, it, expect } from 'vitest'
import { groupAndTrimHistory, type HistoryRow } from '../history-filter'

const u = (content: string): HistoryRow => ({ role: 'user', content })
const a = (content: string, tc?: string): HistoryRow => ({
  role: 'assistant',
  content,
  tool_calls: tc,
})
const t = (id: string, name: string, content: string): HistoryRow => ({
  role: 'tool',
  content,
  tool_call_id: id,
  tool_name: name,
})

describe('groupAndTrimHistory', () => {
  it('keeps simple alternating turns', () => {
    const rows = [u('hi'), a('hello'), u('how are you'), a('fine')]
    expect(groupAndTrimHistory(rows, 5)).toEqual(rows)
  })

  it('trims to last N user turns', () => {
    const rows = [
      u('q1'), a('a1'),
      u('q2'), a('a2'),
      u('q3'), a('a3'),
    ]
    const out = groupAndTrimHistory(rows, 2)
    expect(out).toEqual([u('q2'), a('a2'), u('q3'), a('a3')])
  })

  it('keeps tool messages within a turn (not counted)', () => {
    const rows = [
      u('q1'),
      a('', '[{"id":"c1","name":"f","arguments":{}}]'),
      t('c1', 'f', 'r1'),
      a('done'),
    ]
    expect(groupAndTrimHistory(rows, 1)).toEqual(rows)
  })

  it('drops orphan leading tool message', () => {
    const rows = [
      t('c0', 'x', 'orphan'),
      u('q1'),
      a('a1'),
    ]
    const out = groupAndTrimHistory(rows, 5)
    expect(out).toEqual([u('q1'), a('a1')])
  })

  it('drops trailing assistant(tool_calls) without tool response', () => {
    const rows = [
      u('q1'),
      a('a1'),
      u('q2'),
      a('', '[{"id":"c1","name":"f","arguments":{}}]'),
      // 没有 tool 响应也没有最终 assistant
    ]
    const out = groupAndTrimHistory(rows, 5)
    expect(out).toEqual([u('q1'), a('a1')])
  })

  it('drops half turn where tool_calls has tool but no final assistant', () => {
    const rows = [
      u('q1'),
      a('a1'),
      u('q2'),
      a('', '[{"id":"c1","name":"f","arguments":{}}]'),
      t('c1', 'f', 'r'),
      // 没有最终 assistant 文本
    ]
    const out = groupAndTrimHistory(rows, 5)
    expect(out).toEqual([u('q1'), a('a1')])
  })

  it('returns empty when limit is 0', () => {
    expect(groupAndTrimHistory([u('q'), a('a')], 0)).toEqual([])
  })
})
