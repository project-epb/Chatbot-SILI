import type { ProviderConfig } from '~/llm'

/**
 * Parse LLM provider configs from environment variables.
 *
 * Convention:
 *   LLM_PROVIDER_{N}_NAME     — unique identifier (required)
 *   LLM_PROVIDER_{N}_TYPE     — 'openai' | 'anthropic' (required)
 *   LLM_PROVIDER_{N}_BASE_URL — API base URL (optional, mainly for openai-compatible)
 *   LLM_PROVIDER_{N}_API_KEY  — API key (optional, SDK can also read from its own env var)
 *   LLM_PROVIDER_{N}_MODEL           — default model override
 *   LLM_PROVIDER_{N}_REASONING_MODEL — default reasoning model override
 *   LLM_PROVIDER_{N}_MAX_TOKENS      — default max tokens override
 *
 * Indexes must be contiguous starting from 0.
 */
export function parseLLMProviders(
  env: Record<string, string | undefined>
): ProviderConfig[] {
  const providers: ProviderConfig[] = []

  for (let i = 0; ; i++) {
    const prefix = `LLM_PROVIDER_${i}_`
    const name = env[`${prefix}NAME`]
    const type = env[`${prefix}TYPE`]

    if (!name || !type) break

    const baseURL = env[`${prefix}BASE_URL`]
    const apiKey = env[`${prefix}API_KEY`]
    const model = env[`${prefix}MODEL`]
    const reasoningModel = env[`${prefix}REASONING_MODEL`]
    const maxTokensRaw = env[`${prefix}MAX_TOKENS`]
    const maxTokens = maxTokensRaw ? Number(maxTokensRaw) : undefined

    const base = {
      name,
      model: model || undefined,
      reasoningModel: reasoningModel || undefined,
      maxTokens,
    }

    if (type === 'openai') {
      providers.push({
        ...base,
        type: 'openai',
        options: {
          ...(baseURL && { baseURL }),
          ...(apiKey && { apiKey }),
        },
      })
    } else if (type === 'anthropic') {
      providers.push({
        ...base,
        type: 'anthropic',
        options: {
          ...(baseURL && { baseURL }),
          ...(apiKey && { apiKey }),
        },
      })
    }
  }

  return providers
}
