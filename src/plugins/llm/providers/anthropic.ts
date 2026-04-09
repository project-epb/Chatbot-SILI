import Anthropic, { ClientOptions } from '@anthropic-ai/sdk'

import {
  ChatCompletionFeatures,
  ChatCompletionOptions,
  ChatMessage,
  LLMProviderBase,
  StreamChatDelta,
} from './_base'

export class AnthropicProvider extends LLMProviderBase {
  private client: Anthropic

  constructor(options: ClientOptions) {
    super()
    this.client = new Anthropic(options)
  }

  async *streamChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    features?: ChatCompletionFeatures
  ): AsyncGenerator<StreamChatDelta, void, unknown> {
    // Extract system messages; Anthropic takes system as a separate param
    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const system = systemMessages.map((m) => m.content).join('\n\n')

    const body: Anthropic.MessageCreateParams = {
      model: options.model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.8,
      system: system || undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      stream: true,
    }

    if (features?.enableThinking) {
      // Anthropic extended thinking uses a different parameter structure
      // @ts-ignore - extended thinking may not be in all SDK versions
      body.thinking = {
        type: 'enabled',
        budget_tokens: features.thinkingBudget ?? options.maxTokens ?? 1024,
      }
    }

    const stream = this.client.messages.stream(body)

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as any
        if (delta.type === 'thinking_delta') {
          const text = delta.thinking?.trim()
          if (text) {
            yield { kind: 'reasoning_content', content: text }
          }
        } else if (delta.type === 'text_delta') {
          const text = delta.text?.trim()
          if (text) {
            yield { kind: 'content', content: text }
          }
        }
      } else if (event.type === 'message_delta') {
        const usage = (event as any).usage
        if (usage) {
          yield {
            kind: 'usage',
            usage: {
              promptTokens: usage.input_tokens,
              completionTokens: usage.output_tokens,
            },
          }
        }
      }
    }
  }
}
