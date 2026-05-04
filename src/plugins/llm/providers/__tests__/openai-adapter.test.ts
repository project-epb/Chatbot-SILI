import { describe, it, expect } from 'vitest'
import {
  modelExpectsReasoningContent,
  prepareOpenAIMessages,
  toOpenAIMessage,
} from '../openai-adapter'
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

describe('modelExpectsReasoningContent', () => {
  it.each([
    ['deepseek-v4', true],
    ['deepseek-v4-flash', true],
    ['DeepSeek-V4-thinking', true],
    ['deepseek-r1', false],
    ['deepseek-v3', false],
    ['gpt-4o', false],
    ['claude-sonnet-4.6', false],
    ['', false],
  ])('%s -> %s', (model, expected) => {
    expect(modelExpectsReasoningContent(model)).toBe(expected)
  })
})

describe('prepareOpenAIMessages', () => {
  const assistantWithReasoning: ChatMessage = {
    role: 'assistant',
    content: 'reply',
    reasoning_content: 'I thought hard',
  }
  const assistantWithoutReasoning: ChatMessage = {
    role: 'assistant',
    content: 'reply',
  }
  const userMsg: ChatMessage = { role: 'user', content: 'hi' }

  describe('when model expects reasoning_content (deepseek-v4)', () => {
    it('keeps existing reasoning_content', () => {
      const out = prepareOpenAIMessages(
        [assistantWithReasoning],
        'deepseek-v4-flash'
      ) as any[]
      expect(out[0].reasoning_content).toBe('I thought hard')
    })

    it('fills missing reasoning_content with empty string', () => {
      const out = prepareOpenAIMessages(
        [assistantWithoutReasoning],
        'deepseek-v4-flash'
      ) as any[]
      expect(out[0].reasoning_content).toBe('')
    })

    it('does not touch user/system/tool messages', () => {
      const out = prepareOpenAIMessages([userMsg], 'deepseek-v4') as any[]
      expect(out[0]).not.toHaveProperty('reasoning_content')
    })
  })

  describe('when model does not expect reasoning_content', () => {
    it('strips existing reasoning_content for gpt-4o', () => {
      const out = prepareOpenAIMessages(
        [assistantWithReasoning],
        'gpt-4o'
      ) as any[]
      expect(out[0]).not.toHaveProperty('reasoning_content')
      expect(out[0].content).toBe('reply')
    })

    it('leaves messages without reasoning_content alone', () => {
      const out = prepareOpenAIMessages(
        [assistantWithoutReasoning],
        'gpt-4o'
      ) as any[]
      expect(out[0]).not.toHaveProperty('reasoning_content')
    })

    it('strips for claude as well (when routed via openai-compat)', () => {
      const out = prepareOpenAIMessages(
        [assistantWithReasoning],
        'claude-sonnet-4.6'
      ) as any[]
      expect(out[0]).not.toHaveProperty('reasoning_content')
    })
  })

  it('preserves message order and count', () => {
    const out = prepareOpenAIMessages(
      [
        userMsg,
        assistantWithReasoning,
        userMsg,
        assistantWithoutReasoning,
      ],
      'deepseek-v4'
    )
    expect(out).toHaveLength(4)
    expect(out[0].role).toBe('user')
    expect(out[1].role).toBe('assistant')
    expect(out[2].role).toBe('user')
    expect(out[3].role).toBe('assistant')
  })
})
