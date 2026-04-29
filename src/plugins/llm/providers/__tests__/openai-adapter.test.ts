import { describe, it, expect } from 'vitest'
import { toOpenAIMessage } from '../openai-adapter'
import type { ChatMessage } from '../_base'

describe('toOpenAIMessage', () => {
  it('converts system message', () => {
    const msg: ChatMessage = { role: 'system', content: 'sys' }
    expect(toOpenAIMessage(msg)).toEqual({ role: 'system', content: 'sys' })
  })

  it('converts user message', () => {
    const msg: ChatMessage = { role: 'user', content: 'hi' }
    expect(toOpenAIMessage(msg)).toEqual({ role: 'user', content: 'hi' })
  })

  it('converts plain assistant message', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'reply' }
    expect(toOpenAIMessage(msg)).toEqual({ role: 'assistant', content: 'reply' })
  })

  it('converts assistant with tool_calls', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', name: 'foo', arguments: { x: 1 } },
      ],
    }
    expect(toOpenAIMessage(msg)).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'foo', arguments: '{"x":1}' },
        },
      ],
    })
  })

  it('preserves text alongside tool_calls', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'thinking...',
      tool_calls: [{ id: 'c1', name: 'f', arguments: {} }],
    }
    const out = toOpenAIMessage(msg) as any
    expect(out.content).toBe('thinking...')
    expect(out.tool_calls).toHaveLength(1)
  })

  it('forwards reasoning_content on assistant when present', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'reply',
      reasoning_content: 'thinking trace',
    }
    expect(toOpenAIMessage(msg)).toEqual({
      role: 'assistant',
      content: 'reply',
      reasoning_content: 'thinking trace',
    })
  })

  it('forwards empty reasoning_content (DeepSeek thinking mode quirk)', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'reply',
      reasoning_content: '',
    }
    const out = toOpenAIMessage(msg) as any
    expect(out.reasoning_content).toBe('')
  })

  it('omits reasoning_content key when undefined', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'reply' }
    const out = toOpenAIMessage(msg) as any
    expect(out).not.toHaveProperty('reasoning_content')
  })

  it('converts tool message', () => {
    const msg: ChatMessage = {
      role: 'tool',
      tool_call_id: 'call_1',
      tool_name: 'foo',
      content: 'result',
    }
    expect(toOpenAIMessage(msg)).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'result',
    })
  })
})
