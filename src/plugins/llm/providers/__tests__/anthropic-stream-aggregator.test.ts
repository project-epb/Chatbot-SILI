import { describe, it, expect } from 'vitest'
import { AnthropicStreamAggregator } from '../anthropic-adapter'

describe('AnthropicStreamAggregator', () => {
  it('aggregates a tool_use block from input_json_delta fragments', () => {
    const agg = new AnthropicStreamAggregator()
    agg.startBlock(0, { type: 'tool_use', id: 'tu_1', name: 'foo' })
    agg.appendInputJson(0, '{"x":')
    agg.appendInputJson(0, '1}')
    const finalized = agg.finalizeBlock(0)
    expect(finalized).toEqual({
      kind: 'tool_call',
      toolCall: { id: 'tu_1', name: 'foo', arguments: { x: 1 } },
    })
  })

  it('returns null when finalizing a text block', () => {
    const agg = new AnthropicStreamAggregator()
    agg.startBlock(0, { type: 'text' })
    expect(agg.finalizeBlock(0)).toBeNull()
  })

  it('throws on malformed JSON in tool_use', () => {
    const agg = new AnthropicStreamAggregator()
    agg.startBlock(0, { type: 'tool_use', id: 'tu_1', name: 'f' })
    agg.appendInputJson(0, '{bad')
    expect(() => agg.finalizeBlock(0)).toThrow(/Tool call JSON parse failed/)
  })

  it('handles tool_use with empty input', () => {
    const agg = new AnthropicStreamAggregator()
    agg.startBlock(0, { type: 'tool_use', id: 'tu_1', name: 'f' })
    const out = agg.finalizeBlock(0)
    expect(out).toEqual({
      kind: 'tool_call',
      toolCall: { id: 'tu_1', name: 'f', arguments: {} },
    })
  })
})
