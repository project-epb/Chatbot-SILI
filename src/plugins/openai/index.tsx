/**
 * AI Chat Plugin - make chat bot great again!
 * @author dragon-fish
 * @license MIT
 */
import { Context, Time, arrayBufferToBase64 } from 'koishi'

import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cancellableInterval } from '@/utils/cancellableDefferred'

import BasePlugin from '~/_boilerplate'

import { getUserNickFromSession } from '$utils/formatSession'
import { Memory, MemoryClient } from 'mem0ai'
import { ClientOptions, OpenAI } from 'openai'
import {
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions.mjs'
import { CompletionUsage } from 'openai/resources/completions'

import ChatCensorService from './plugins/ChatCensorService'
import PluginChannelSummary from './plugins/PluginChannelSummary'

declare module 'koishi' {
  export interface Tables {
    openai_chat: OpenAIConversationLog
  }
  export interface User {
    openai_last_conversation_id: string
  }
  interface Context {
    openai: OpenAI
    mem0?: MemoryClient
  }
}

interface OpenAIConversationLog {
  id: number
  conversation_id: string
  conversation_owner: number
  role: 'system' | 'user' | 'assistant'
  content: string
  usage?: CompletionUsage
  model?: string
  time: number
}

export interface Config {
  /** OpenAI 配置 */
  openaiOptions: ClientOptions
  /** 普通聊天(chat)时使用的模型 */
  model?: string
  /** 推理模式时使用的模型（例如 gpt-o1, deepseek-r1） */
  reasoningModel?: string
  /** 最大 token 限额 */
  maxTokens?: number
  /** 系统提示词 */
  systemPrompt?: Partial<{
    /** 普通聊天，也就是和 bot 直接聊天时的提示词，一般是角色扮演的要求 */
    basic: string
    /** 群聊总结时的提示词，一般是要求总结的格式 */
    channelSummary: string
    /** 审查敏感内容时的提示词，一般是要求审核哪些内容 */
    censor: string
    /** 其他自定义提示词 */
    [key: string]: string
  }>
  /** 用于总结群聊消息，每个群保留的消息数量 */
  recordsPerChannel?: number
  /** 模型别名（主要用于火山引擎） */
  modelAliases?: Record<string, string>
}
export declare const Config: Config

export default class PluginOpenAi extends BasePlugin<Config> {
  static inject = ['html', 'database']

  readonly openai: OpenAI
  readonly memory?: MemoryClient
  readonly openaiOptions: ClientOptions
  RANDOM_ERROR_MSG = (
    <random>
      <template>SILI不知道喔。</template>
      <template>这道题SILI不会，长大后在学习~</template>
      <template>SILI的头好痒，不会要长脑子了吧？！</template>
      <template>锟斤拷锟斤拷锟斤拷</template>
    </random>
  )
  readonly MODEL_ALIASES: Record<string, string> = {}
  // 用户同时只能进行一个对话，防止在一次对话结束前发起新的对话
  readonly CONVERSATION_LOCKS = new Set<string | number>()

  constructor(ctx: Context, config: Config) {
    const defaultConfigs = {
      model: 'gpt-4o-mini',
      reasoningModel: 'gpt-o1-mini',
      maxTokens: 4096,
      recordsPerChannel: 100,
      systemPrompt: {
        basic: PluginOpenAi.readPromptFile('SILI-v4-2.md'),
        channelSummary: PluginOpenAi.readPromptFile('channel-summary.md'),
        censor: PluginOpenAi.readPromptFile('censor.txt'),
      },
    }
    config = {
      ...defaultConfigs,
      ...config,
      systemPrompt: {
        ...defaultConfigs.systemPrompt,
        ...config.systemPrompt,
      },
    }
    if (!config.openaiOptions) {
      throw new Error('Required payloads: openaiOptions')
    }
    super(ctx, config, 'openai')

    this.openaiOptions = this.config.openaiOptions || {}
    this.openai = new OpenAI({
      ...this.openaiOptions,
    })
    this.#initDatabase()
    this.#initCommands()
    if (config.modelAliases) {
      this.MODEL_ALIASES = config.modelAliases
    }

    this.ctx.set('openai', this.openai)

    if (process.env.MEM0_BASE_URL) {
      this.memory = new MemoryClient({
        apiKey: '',
        host: process.env.MEM0_BASE_URL,
      })
    } else if (process.env.MEM0_API_KEY) {
      this.memory = new MemoryClient({
        apiKey: process.env.MEM0_API_KEY,
        organizationId: process.env.MEM0_ORGANIZATION_ID,
        projectId: process.env.MEM0_PROJECT_ID,
      })
    }
    if (this.memory) {
      this.ctx.set('mem0', this.memory)
    }

    this.#installSubPlugins()
  }

  async #initDatabase() {
    this.ctx.model.extend('user', {
      openai_last_conversation_id: 'string',
    })
    this.ctx.model.extend(
      'openai_chat',
      {
        id: 'integer',
        conversation_id: 'string',
        conversation_owner: 'integer',
        role: 'string',
        content: 'string',
        usage: 'json',
        model: 'string',
        time: 'integer',
      },
      {
        primary: 'id',
        autoInc: true,
        indexes: [
          // getChatHistoriesById
          ['conversation_id', 'time'],
          // 通过用户查找记录
          ['conversation_owner', 'time'],
          // 用于可能的时间范围清理操作
          ['time'],
        ],
      }
    )
  }
  #installSubPlugins() {
    this.ctx.plugin(PluginChannelSummary, this.config)
    this.ctx.plugin(ChatCensorService, this.config)
  }

  #initCommands() {
    this.ctx.command('openai', 'Make ChatBot Great Again')

    this.ctx
      .command('openai.models', 'List all models', { authority: 3 })
      .action(async () => {
        const { data } = await this.openai.models.list()
        this.logger.info('openai.models', data)
        if (data.length >= 10) {
          return (
            <html>
              <p>Currently available models:</p>
              <ul>
                {data.map((i) => (
                  <li>{i.id}</li>
                ))}
              </ul>
            </html>
          )
        } else {
          return (
            <>
              <p>Currently available models:</p>
              <p>{data.map((i) => i.id).join('\n')}</p>
            </>
          )
        }
      })

    this.ctx
      .command('openai/chat <content:text>', 'ChatGPT', {
        minInterval: 1 * Time.minute,
        maxUsage: 10,
        bypassAuthority: 2,
      })
      .shortcut(/(.+)[\?？]$/, {
        args: ['$1'],
        prefix: true,
      })
      .shortcut(/(.+)[\?？][\!！]$/, {
        args: ['$1'],
        prefix: true,
        options: {
          thinking: true,
        },
      })
      .option('no-prompt', '-P Disable system prompts', {
        type: 'boolean',
        hidden: true,
      })
      .option('prompt', '-p <prompt:string>', {
        hidden: true,
        authority: 2,
      })
      .option('model', '-m <model:string>', {
        hidden: true,
        authority: 2,
      })
      .option('thinking', '-t Enable reasoning mode', {
        type: 'boolean',
        hidden: true,
        fallback: false,
      })
      .option('search', '-s Enable web search', {
        type: 'boolean',
        hidden: true,
        fallback: false,
      })
      .option('debug', '-d', { type: 'boolean', hidden: true, authority: 2 })
      .userFields(['id', 'name', 'openai_last_conversation_id', 'authority'])
      .check((_, content) => {
        if (!content?.trim()) {
          return ''
        }
      })
      .check(({ options }) => {
        if (options.model) {
          const maybeRealModel = this.MODEL_ALIASES[options.model]
          if (maybeRealModel) {
            options.model = maybeRealModel
          }
        }
      })
      .check(({ session }) => {
        const userId = session.user.id
        if (this.CONVERSATION_LOCKS.has(userId)) {
          session?.setReaction?.('33').catch(() => {})
          return ''
        }
      })
      .action(async ({ session, options }, content) => {
        this.logger.info('[chat] input', options, content)

        const startTime = Date.now()
        const conversation_owner = session.user.id
        const userName = getUserNickFromSession(session)

        this.CONVERSATION_LOCKS.add(conversation_owner)

        const conversation_id: string =
          (session.user.openai_last_conversation_id ||= crypto.randomUUID())

        const histories = await this.getChatHistoriesById(conversation_id)
        this.logger.info('[chat] user data', {
          conversation_owner,
          conversation_id,
          historiesLenth: histories.length,
        })

        let memories: Memory[] = []
        if (this.memory && session.user.authority > 1) {
          memories = await this.memory
            .search(content, {
              user_id: conversation_id,
              agent_id: 'sili',
              limit: 5,
            })
            .catch((e) => {
              this.logger.error('[chat] memory search error:', e)
              return [] as Memory[]
            })
          this.logger.info('[chat] memories:', memories)
        }

        if (options['no-prompt']) {
          options.prompt = 'You are an useful AI assistant.'
        }

        const model =
          options.model || options.thinking
            ? this.config.reasoningModel || 'deepseek-r1'
            : this.config.model || 'gpt-4o-mini'
        const body: ChatCompletionCreateParamsStreaming = {
          model,
          messages: [
            // base prompt
            {
              role: 'system',
              content: options.prompt || this.config.systemPrompt.basic,
            },
            // provide user info
            {
              role: 'system',
              content: [
                `- You are talking with: ${userName}`,
                `- Current time: ${new Date().toISOString()} (user is in UTC+8)`,
                memories.length
                  ? 'Below is your memories, use it at your discretion:\n' +
                    memories
                      .map((m) => m.memory)
                      .filter(Boolean)
                      .map((m, index) => `${index + 1}. ${m}`)
                      .join('\n')
                  : '',
              ]
                .map((i) => i.trim())
                .filter(Boolean)
                .join('\n'),
            },
            // chat history
            ...histories,
            // current user input
            { role: 'user', content },
          ],
          max_tokens: this.config.maxTokens ?? 1024,
          top_p: 0.8,
          temperature: 0.8,
          stream: true,
          stream_options: {
            include_usage: true,
          },
          // @ts-expect-error Qwen3 specific
          enable_thinking: !!options.thinking,
          thinking_budget: this.config.maxTokens ?? 1024,
          enable_search:
            !!options.search || this.checkShouldEnableSearch(content),
        }
        const stream = await this.openai.chat.completions
          .create(body, {
            timeout: 90 * 1000,
          })
          .catch((e) => {
            this.CONVERSATION_LOCKS.delete(conversation_owner)
            console.error('[chat] request error:', e)
            throw e
          })

        // 如果没有开启调试模式，每思考 10 秒发送一个状态指示器
        const emojiCodes = ['181', '285', '267', '312', '284', '37']
        let currentEmojiIndex = -1
        const stopEmojiReaction = cancellableInterval(
          () => {
            if (sendContentFromIndex || sendThinkingFromIndex) {
              stopEmojiReaction()
            } else {
              currentEmojiIndex = (currentEmojiIndex + 1) % emojiCodes.length
              session
                ?.setReaction?.(emojiCodes[currentEmojiIndex])
                .catch(() => {})
            }
          },
          10 * 1000,
          60 * 1000
        )

        // 读取流式数据
        let fullThinking = ''
        let fullContent = ''
        let sendContentFromIndex = 0
        let sendThinkingFromIndex = 0
        let usage: CompletionUsage | undefined
        let thinkingEnd = false
        let lastMessageId: string
        const shouldSendThinking = options.debug

        // #region chat-stream
        try {
          for await (const chunk of stream) {
            if (chunk.usage) {
              usage = chunk.usage
            }
            const thinking: string =
              (chunk as any).choices?.[0]?.delta?.reasoning_content?.trim() ||
              ''
            const content = chunk.choices?.[0]?.delta?.content?.trim() || ''

            // 内心独白
            if (thinking) {
              fullThinking += thinking
              if (shouldSendThinking) {
                const { text, nextIndex } = this.splitContent(
                  fullThinking,
                  sendThinkingFromIndex
                )
                sendThinkingFromIndex = nextIndex
                if (text) {
                  this.logger.info('[chat] thinking:', text)
                  stopEmojiReaction()
                  ;[lastMessageId = lastMessageId] = await session.sendQueued(
                    <>
                      {lastMessageId && <quote id={lastMessageId}></quote>}
                      [内心独白] {text}
                    </>
                  )
                }
              }
            }
            // 内心独白结束
            if (content && !thinkingEnd) {
              thinkingEnd = true
              this.logger.info('[chat] think end:', fullThinking)
              if (
                fullThinking &&
                sendThinkingFromIndex < fullThinking.length &&
                shouldSendThinking
              ) {
                stopEmojiReaction()
                ;[lastMessageId = lastMessageId] = await session.sendQueued(
                  <>
                    {lastMessageId && <quote id={lastMessageId}></quote>}
                    [内心独白] {fullThinking.slice(sendThinkingFromIndex)}
                  </>
                )
              }
            }
            // 正文内容
            if (content) {
              fullContent += content
              const { text, nextIndex } = this.splitContent(
                fullContent,
                sendContentFromIndex
              )
              sendContentFromIndex = nextIndex
              if (text) {
                this.logger.info('[chat] sending:', text)
                stopEmojiReaction()
                // await session.sendQueued(text)
                ;[lastMessageId = lastMessageId] = await session.sendQueued(
                  <>
                    {lastMessageId && <quote id={lastMessageId}></quote>}
                    {text}
                  </>
                )
              }
            }
          }
        } catch (e) {
          this.logger.error('[chat] stream error:', e)
          return (
            <>
              <quote id={session.messageId}></quote>
              {this.RANDOM_ERROR_MSG}
            </>
          )
        } finally {
          this.CONVERSATION_LOCKS.delete(conversation_owner)
          stopEmojiReaction()
        }
        //#endregion

        // 处理剩余的文本
        if (sendContentFromIndex < fullContent.length) {
          const text = fullContent.slice(sendContentFromIndex)
          this.logger.info('[chat] send remaining:', text)
          ;[lastMessageId = lastMessageId] = await session.sendQueued(
            <>
              {lastMessageId && <quote id={lastMessageId}></quote>}
              {text}
            </>
          )
        }

        if (usage && options.debug) {
          await session.sendQueued(
            <>
              {lastMessageId && <quote id={lastMessageId}></quote>}
              {JSON.stringify(usage, null, 2)}
            </>
          )
        }

        this.logger.success('[chat] stream end:', {
          fullThinking,
          fullContent,
          usage,
        })

        if (fullContent) {
          // save conversations to database
          ;[
            { role: 'user', content, time: startTime },
            {
              role: 'assistant',
              content: fullContent,
              time: Date.now(),
              usage,
              model,
            },
          ].forEach((item) =>
            // @ts-ignore
            this.ctx.database.create('openai_chat', {
              ...item,
              conversation_owner,
              conversation_id,
            })
          )

          // update memories
          if (this.memory && session.user.authority > 1) {
            const updates = await this.memory
              .add(
                [
                  { role: 'user', content },
                  { role: 'assistant', content: fullContent },
                ],
                {
                  user_id: conversation_id,
                  agent_id: 'sili',
                }
              )
              .catch((e) => {
                this.logger.error('[chat] failed to update memory:', e)
                return [] as Memory[]
              })
            updates.length &&
              this.logger.info('[chat] memory updates:', updates)
          }
        }
      })

    this.ctx
      .command('openai/chat.reset', '开始新的对话')
      .userFields(['openai_last_conversation_id'])
      .action(async ({ session }) => {
        if (!session.user.openai_last_conversation_id) {
          return (
            <random>
              <>嗯……我们好像还没聊过什么呀……</>
              <>咦？你还没有和SILI分享过你的故事呢！</>
              <>欸？SILI好像还没和你讨论过什么哦。</>
            </random>
          )
        } else {
          session.user.openai_last_conversation_id = ''
          return (
            <random>
              <>让我们开始新话题吧！</>
              <>嗯……那我们聊点别的吧！</>
              <>好吧，那我就不提之前的事了。</>
              <>你有更好的点子和SILI分享吗？</>
              <>咦？是还有其他问题吗？</>
            </random>
          )
        }
      })

    this.ctx
      .command(
        'openai.tts <input:text>',
        'Generates audio from the input text',
        {
          maxUsage: 3,
          bypassAuthority: 3,
        }
      )
      .option('model', '-m <model:string> tts-1 or tts-1-hd')
      .option(
        'voice',
        '-v <voice:string> alloy, echo, fable, onyx, nova, and shimmer'
      )
      .option('speed', '-s <speed:number> 0.25 - 4.0')
      .action(async ({ options }, input) => {
        if (!input) {
          return 'SILI不知道你想说什么呢。'
        }

        options = Object.fromEntries(
          Object.entries(options).filter(([, val]) => !!val)
        )

        const buffer = await this.createTTS(input, options as any)
        const base64 = arrayBufferToBase64(buffer)
        return <audio src={`data:audio/mp3;base64,${base64}`}></audio>
      })
  }

  /**
   * 提升对话连贯性，将对话内容分割成多个部分
   *
   * 首先抛弃 fromIndex 之前的内容，剩下的称为 rest
   * 将 rest 按照 splitChars 中的字符进行分割，得到分割点的索引
   * 如果分割点的数量大于 expectParts，返回前 expectParts 个分割点之间的内容，nextIndex 为第 expectParts 个分割点的索引（注意是基于 fullText 的索引）
   * 如果分割点的数量小于 expectParts，什么也不做：返回 text 为空字符串，nextIndex 为 fromIndex
   * 如果剩余的内容长度大于 maxLength，尝试减少 expectParts 的数量，直到剩余长度小于 maxLength
   * 如果 expectParts 为 0，意味着剩余的内容没有合适的分割点，作为保底机制，把剩余内容直接返回，nextIndex 设置到末尾
   * 注意：返回的 nextIndex 都是基于 fullText 的索引，如果基于 rest 计算要加上 fromIndex
   *
   * @param fullText
   * @param fromIndex
   * @param splitChars
   * @param expectParts
   * @param maxLength
   */
  splitContent(
    fullText: string,
    fromIndex: number = 0,
    splitChars: string[] = ['。', '？', '！', '\n'],
    expectParts: number = 5,
    maxLength: number = 300
  ): {
    text: string
    nextIndex: number
  } {
    // 似乎出现了一些问题，fromIndex 大于等于 fullText 的长度，直接返回空字符串，修复 nextIndex 为 fullText 的长度
    if (fromIndex >= fullText.length) {
      return { text: '', nextIndex: fullText.length }
    }
    if (expectParts === 0) {
      return { text: fullText.slice(fromIndex), nextIndex: fullText.length }
    }
    const rest = fullText.slice(fromIndex)
    if (rest.length > maxLength) {
      return this.splitContent(
        fullText,
        fromIndex,
        splitChars,
        expectParts - 1,
        maxLength
      )
    }
    const splitIndexes = rest
      .split('')
      .reduce(
        (acc, char, index) =>
          splitChars.includes(char) ? [...acc, index] : acc,
        [] as number[]
      )
    if (splitIndexes.length >= expectParts) {
      const nextIndex = splitIndexes[expectParts - 1] + fromIndex + 1
      return {
        text: fullText.slice(fromIndex, nextIndex),
        nextIndex,
      }
    }
    return { text: '', nextIndex: fromIndex }
  }

  async createTTS(
    input: string,
    options?: Partial<OpenAI.Audio.Speech.SpeechCreateParams>
  ) {
    const data = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input,
      response_format: 'mp3',
      speed: 1,
      ...options,
    })
    return data.arrayBuffer()
  }

  static readPromptFile(file: string) {
    try {
      return readFileSync(resolve(__dirname, `./prompts/${file}`), {
        encoding: 'utf-8',
      })
        .toString()
        .trim()
    } catch (e) {
      return ''
    }
  }

  async getChatHistoriesById(
    conversation_id: string,
    limit = 10
  ): Promise<OpenAIConversationLog[]> {
    return (
      ((
        await this.ctx.database.get(
          'openai_chat',
          { conversation_id },
          {
            sort: { time: 'desc' },
            limit: Math.min(25, Math.max(0, limit)),
            fields: ['content', 'role'],
          }
        )
      ).reverse() as OpenAIConversationLog[]) || []
    )
  }

  readonly ENABLE_SEARCH_KEYWORDS = [
    '搜索',
    '查找',
    '查一下',
    '找一下',
    '搜一下',
    '帮我找',
    '帮我搜',
    '帮我查',
    '最近',
    '最新',
    '今天',
    '昨天',
    '前天',
    '前几天',
    '几天前',
    '这周',
    '本周',
    '这个月',
    '本月',
    '今年',
    '新闻',
    '资讯',
    '动态',
    '发生了什么',
    '发生了啥',
  ]
  checkShouldEnableSearch(content: string): boolean {
    return this.ENABLE_SEARCH_KEYWORDS.some((keyword) =>
      content.includes(keyword)
    )
  }
}
