export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant'
      content: string
      tool_calls?: ToolCall[]
      reasoning_content?: string
    }
  | {
      role: 'tool'
      tool_call_id: string
      tool_name: string
      content: string
    }

export interface ChatCompletionOptions {
  model: string
  maxTokens?: number
  temperature?: number
  topP?: number
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required'
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

export type StreamFinishReason = 'stop' | 'tool_calls' | 'length' | 'other'

export type StreamChatDelta =
  | { kind: 'reasoning_content'; content: string }
  | { kind: 'content'; content: string }
  | { kind: 'tool_call'; toolCall: ToolCall }
  | { kind: 'usage'; usage: ChatCompletionUsage }
  | { kind: 'error'; error: Error }
  | { kind: 'finish'; reason: StreamFinishReason }

export interface ModelInfo {
  id: string
  name?: string
  ownedBy?: string
  contextLength?: number
  inputPrice?: number
  outputPrice?: number
}

export abstract class LLMProviderBase {
  protected normalizeOptions(
    options: ChatCompletionOptions,
    features?: ChatCompletionFeatures
  ): ChatCompletionOptions {
    return options
  }

  async listModels(): Promise<ModelInfo[]> {
    return []
  }

  abstract streamChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    features?: ChatCompletionFeatures
  ): AsyncGenerator<StreamChatDelta, void, unknown>
}
