import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ChatMessage } from './_base'

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
      } as ChatCompletionMessageParam
    case 'user':
      return { role: 'user', content: msg.content }
    case 'system':
      return { role: 'system', content: msg.content }
  }
}
