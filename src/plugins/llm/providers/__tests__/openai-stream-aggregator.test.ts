import { describe, it, expect } from 'vitest'
import { OpenAIStreamAggregator } from '../openai-adapter'

describe('OpenAIStreamAggregator', () => {
  it('aggregates a single tool_call from fragments', () => {
    const agg = new OpenAIStreamAggregator()
    agg.absorbToolCallDeltas([
      { index: 0, id: 'call_1', type: 'function', function: { name: 'foo', arguments: '{"x":' } },
    ])
    agg.absorbToolCallDeltas([
      { index: 0, function: { arguments: '1}' } },
    ])
    const calls = agg.finalizeToolCalls()
    expect(calls).toEqual([
      { id: 'call_1', name: 'foo', arguments: { x: 1 } },
    ])
  })

  it('aggregates multiple parallel tool_calls', () => {
    const agg = new OpenAIStreamAggregator()
    agg.absorbToolCallDeltas([
      { index: 0, id: 'a', type: 'function', function: { name: 'fa', arguments: '{}' } },
      { index: 1, id: 'b', type: 'function', function: { name: 'fb', arguments: '{"y":2}' } },
    ])
    expect(agg.finalizeToolCalls()).toEqual([
      { id: 'a', name: 'fa', arguments: {} },
      { id: 'b', name: 'fb', arguments: { y: 2 } },
    ])
  })

  it('throws on malformed JSON', () => {
    const agg = new OpenAIStreamAggregator()
    agg.absorbToolCallDeltas([
      { index: 0, id: 'x', type: 'function', function: { name: 'f', arguments: '{not json' } },
    ])
    expect(() => agg.finalizeToolCalls()).toThrow(/Tool call JSON parse failed/)
  })

  it('returns empty when no tool calls', () => {
    const agg = new OpenAIStreamAggregator()
    expect(agg.finalizeToolCalls()).toEqual([])
  })
})
