import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ChatMessage, ToolCall } from './_base'

export function toOpenAIMessage(msg: ChatMessage): ChatCompletionMessageParam {
  switch (msg.role) {
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content,
      }
    case 'assistant':
      return {
        role: 'assistant',
        content: msg.content || null,
        ...(msg.tool_calls?.length
          ? {
              tool_calls: msg.tool_calls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }
          : {}),
        // DeepSeek 等 thinking-capable 厂商在 thinking mode 下要求 echo back
        // reasoning_content（即使为空字符串）。其他厂商对未知字段宽容。
        ...(msg.reasoning_content !== undefined
          ? { reasoning_content: msg.reasoning_content }
          : {}),
      } as ChatCompletionMessageParam
    case 'user':
      return { role: 'user', content: msg.content }
    case 'system':
      return { role: 'system', content: msg.content }
  }
}

interface OpenAIToolCallDelta {
  index: number
  id?: string
  type?: 'function'
  function?: { name?: string; arguments?: string }
}

interface ToolCallBuffer {
  id: string
  name: string
  argText: string
}

export class OpenAIStreamAggregator {
  private toolCallBuffer = new Map<number, ToolCallBuffer>()

  absorbToolCallDeltas(deltas: OpenAIToolCallDelta[] | undefined): void {
    for (const tc of deltas ?? []) {
      const buf =
        this.toolCallBuffer.get(tc.index) ??
        ({ id: '', name: '', argText: '' } as ToolCallBuffer)
      if (tc.id) buf.id = tc.id
      if (tc.function?.name) buf.name = tc.function.name
      if (tc.function?.arguments) buf.argText += tc.function.arguments
      this.toolCallBuffer.set(tc.index, buf)
    }
  }

  finalizeToolCalls(): ToolCall[] {
    const out: ToolCall[] = []
    for (const buf of this.toolCallBuffer.values()) {
      let args: Record<string, any>
      try {
        args = buf.argText ? JSON.parse(buf.argText) : {}
      } catch (e) {
        throw new Error(
          `Tool call JSON parse failed for ${buf.name}: ${buf.argText}`
        )
      }
      out.push({ id: buf.id, name: buf.name, arguments: args })
    }
    return out
  }
}
