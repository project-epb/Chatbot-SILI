import type Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from './_base'

export function splitSystemMessages(messages: ChatMessage[]): {
  system: string
  rest: ChatMessage[]
} {
  const system = messages
    .filter((m): m is ChatMessage & { role: 'system' } => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const rest = messages.filter((m) => m.role !== 'system')
  return { system, rest }
}

export function toAnthropicMessages(
  messages: ChatMessage[]
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = []

  const flush = () => {
    if (pendingToolResults.length) {
      out.push({ role: 'user', content: pendingToolResults })
      pendingToolResults = []
    }
  }

  for (const m of messages) {
    if (m.role === 'system') continue

    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: m.content,
      })
      continue
    }

    flush()

    if (m.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        })
      }
      out.push({ role: 'assistant', content: blocks })
    } else {
      out.push({ role: 'user', content: m.content })
    }
  }

  flush()
  return out
}
