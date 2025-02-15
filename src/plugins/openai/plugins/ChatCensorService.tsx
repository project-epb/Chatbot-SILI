/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */
import { Context, Service } from 'koishi'

import { OpenAI } from 'openai'

import type { Config as BaseConfig } from '..'

export declare const Config: BaseConfig

declare module 'koishi' {
  interface Context {
    openaiChatCensor: ChatCensorService
  }
}

export default class ChatCensorService extends Service {
  static readonly inject = ['openai']
  readonly openai: OpenAI

  constructor(ctx: Context, config: BaseConfig) {
    if (!ctx.openai || !config.systemPrompt?.censor) {
      throw new Error('Required payloads: openai, systemPrompt.censor', {
        cause: config,
      })
    }
    super(ctx, 'openaiChatCensor', true)

    this.openai = ctx.openai
  }

  async reviewAIConversation(
    base_prompt: string,
    user: string,
    assistant: string
  ): Promise<{
    passed: boolean
    acceptable: string
  }> {
    return this.openai.chat.completions
      .create(
        {
          model: this.config.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: this.config.systemPrompt.censor,
            },
            {
              role: 'user',
              content: JSON.stringify({ base_prompt, user, assistant }),
            },
          ],
          response_format: {
            type: 'json_schema',
            // { acceptable: boolean; reason: string }
            json_schema: {
              name: 'ReviewConversationResult',
              description: 'result of conversation review',
              schema: {
                type: 'object',
                properties: {
                  acceptable: {
                    type: 'boolean',
                    description: 'The conversation meets the rules or not',
                  },
                  reason: {
                    type: 'string',
                    description: 'Not acceptable reason, can be empty string',
                  },
                },
                required: ['acceptable', 'reason'],
              },
            },
          },
        },
        {
          timeout: 30 * 1000,
        }
      )
      .then((data) => {
        const text = data.choices?.[0]?.message?.content?.trim()
        const result = JSON.parse(text || '{}')
        console.info('[review]', text, result)
        if (typeof result.acceptable !== 'boolean') {
          throw new Error('Expected schemed response, but got ' + result)
        }
        return result
      })
      .catch((e) => {
        console.error('[review] ERROR', e)
        return { acceptable: true, reason: e?.message || 'Internal error' }
      })
  }
}
