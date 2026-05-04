import { describe, it, expect } from 'vitest'
import { toAnthropicMessages, splitSystemMessages } from '../anthropic-adapter'
import type { ChatMessage } from '../_base'

describe('splitSystemMessages', () => {
  it('separates system from non-system', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 's1' },
      { role: 'system', content: 's2' },
      { role: 'user', content: 'hi' },
    ]
    const { system, rest } = splitSystemMessages(msgs)
    expect(system).toBe('s1\n\ns2')
    expect(rest.length).toBe(1)
    expect(rest[0].role).toBe('user')
  })
})

describe('toAnthropicMessages', () => {
  it('converts simple user/assistant exchange', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]
    expect(toAnthropicMessages(msgs)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ])
  })

  it('converts assistant with tool_use blocks', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'let me check',
        tool_calls: [{ id: 'tu_1', name: 'foo', arguments: { x: 1 } }],
      },
    ]
    const out = toAnthropicMessages(msgs)
    expect(out).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'let me check' },
          { type: 'tool_use', id: 'tu_1', name: 'foo', input: { x: 1 } },
        ],
      },
    ])
  })

  it('omits empty text block when assistant has only tool_calls', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tu_1', name: 'foo', arguments: {} }],
      },
    ]
    const out = toAnthropicMessages(msgs)
    expect(out[0].content).toEqual([
      { type: 'tool_use', id: 'tu_1', name: 'foo', input: {} },
    ])
  })

  it('merges consecutive tool messages into single user with tool_result blocks', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'q' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tu_1', name: 'a', arguments: {} },
          { id: 'tu_2', name: 'b', arguments: {} },
        ],
      },
      { role: 'tool', tool_call_id: 'tu_1', tool_name: 'a', content: 'r1' },
      { role: 'tool', tool_call_id: 'tu_2', tool_name: 'b', content: 'r2' },
      { role: 'assistant', content: 'done' },
    ]
    const out = toAnthropicMessages(msgs)
    expect(out).toHaveLength(4)
    expect(out[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'r1' },
        { type: 'tool_result', tool_use_id: 'tu_2', content: 'r2' },
      ],
    })
    expect(out[3]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
    })
  })

  it('drops system messages (caller should handle separately)', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ]
    expect(toAnthropicMessages(msgs)).toEqual([{ role: 'user', content: 'u' }])
  })
})
