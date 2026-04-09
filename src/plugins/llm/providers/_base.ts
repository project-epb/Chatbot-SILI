export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  model: string
  maxTokens?: number
  temperature?: number
  topP?: number
}

export interface ChatCompletionFeatures {
  enableThinking?: boolean
  thinkingBudget?: number
  enableSearch?: boolean
}

export interface ChatCompletionUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type StreamChatDelta =
  | { kind: 'reasoning_content'; content: string }
  | { kind: 'content'; content: string }
  | { kind: 'usage'; usage: ChatCompletionUsage }
  | { kind: 'error'; error: Error }

export interface ModelInfo {
  id: string
  name?: string
  ownedBy?: string
  /** Context window size in tokens */
  contextLength?: number
  /** Price per million input tokens (USD) */
  inputPrice?: number
  /** Price per million output tokens (USD) */
  outputPrice?: number
}

export abstract class LLMProviderBase {
  /**
   * Normalize options before sending to the API.
   * Override in subclasses to handle model-specific constraints
   * (e.g., Claude thinking mode requires temperature=1).
   */
  protected normalizeOptions(
    options: ChatCompletionOptions,
    features?: ChatCompletionFeatures
  ): ChatCompletionOptions {
    return options
  }

  /**
   * List available models. Returns empty array if not supported.
   * Providers may populate optional fields (name, pricing, etc.) when the API exposes them.
   */
  async listModels(): Promise<ModelInfo[]> {
    return []
  }

  abstract streamChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    features?: ChatCompletionFeatures
  ): AsyncGenerator<StreamChatDelta, void, unknown>
}
