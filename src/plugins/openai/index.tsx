/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */
import { Context, Session, Time, arrayBufferToBase64 } from 'koishi'

import crypto from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import BasePlugin from '~/_boilerplate'

import { getUserNickFromSession } from '$utils/formatSession'
import { safelyStringify } from '$utils/safelyStringify'
import { ClientOptions, OpenAI } from 'openai'
import { CompletionUsage } from 'openai/resources/completions'

declare module 'koishi' {
  export interface Tables {
    openai_chat: OpenAIConversationLog
  }
  export interface User {
    openai_last_conversation_id: string
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
  openaiOptions: ClientOptions
  model: string
  maxTokens: number
  recordsPerChannel: number
  modelAliases?: Record<string, string>
}

export default class PluginOpenAi extends BasePlugin {
  static inject = ['html', 'database']

  openai: OpenAI
  openaiOptions: ClientOptions
  SILI_PROMPT = PluginOpenAi.readPromptFile('SILI-v3.md')
  CHAT_SUMMARY_PROMPT = PluginOpenAi.readPromptFile('chat-summary.txt')
  CENSOR_PROMPT = PluginOpenAi.readPromptFile('censor.txt')
  RANDOM_ERROR_MSG = (
    <random>
      <template>SILI不知道喔。</template>
      <template>这道题SILI不会，长大后在学习~</template>
      <template>SILI的头好痒，不会要长脑子了吧？！</template>
      <template>锟斤拷锟斤拷锟斤拷</template>
    </random>
  )
  #chatRecords: Record<string, Session.Payload[]> = {}
  readonly modelAliases: Record<string, string> = {}

  constructor(
    ctx: Context,
    config: Partial<Config> = { recordsPerChannel: 100 }
  ) {
    super(ctx, config, 'openai')

    this.openaiOptions = config.openaiOptions || {}
    this.openai = new OpenAI({
      ...this.openaiOptions,
    })
    this.#initDatabase()
    this.#handleRecordsLog().then(() => {
      this.#initListeners()
      this.#initCommands()
    })
    if (config.modelAliases) {
      this.modelAliases = config.modelAliases
    }
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
      }
    )
  }
  async #handleRecordsLog() {
    const logFile = resolve(__dirname, 'records.log')
    try {
      const text = (await readFile(logFile)).toString()
      const obj = JSON.parse(text)
      this.#chatRecords = obj
    } catch (_) {}

    process.on('exit', () => {
      try {
        writeFileSync(logFile, safelyStringify(this.#chatRecords))
      } catch (e) {
        console.info('save logs error', e)
      }
    })
  }

  #initListeners() {
    this.ctx.channel().on('message', this.addRecord.bind(this))
    this.ctx.channel().on('send', this.addRecord.bind(this))
  }

  #initCommands() {
    this.ctx.command('openai', 'Make ChatBot Great Again')

    this.ctx
      .channel()
      .command('openai/chat-summary', '群里刚刚都聊了些什么', {
        authority: 2,
      })
      .alias('总结聊天', '群里刚刚聊了什么')
      .option('number', '-n <number:posint>', { hidden: true })
      .option('channel', '-c <channel:string>', { hidden: true })
      .action(async ({ session, options }) => {
        await session.send(
          <>
            <quote id={session.messageId}></quote>稍等，让我看看聊天记录……
          </>
        )
        const msg = await this.summarize(options.channel || session.channelId)
        return msg
      })

    this.ctx
      .command('openai.models', 'List models', { authority: 3 })
      .action(async () => {
        const { data } = await this.openai.models.list()
        this.logger.info('openai.models', data)
        return (
          <>
            <p>Currently available models:</p>
            <p>{data.map((i) => i.id).join('\n')}</p>
          </>
        )
      })

    this.ctx
      .command('openai/chat <content:text>', 'ChatGPT', {
        minInterval: 1 * Time.minute,
        bypassAuthority: 3,
        maxUsage: 10,
      })
      .shortcut(/(.+)[\?？]$/, {
        args: ['$1'],
        prefix: true,
      })
      .alias()
      .option('prompt', '-p <prompt:string>', {
        hidden: true,
        authority: 3,
      })
      .option('model', '-m <model:string>', {
        hidden: true,
        authority: 3,
      })
      .option('debug', '-d', { hidden: true, authority: 3 })
      .userFields(['id', 'name', 'openai_last_conversation_id', 'authority'])
      .check(({ options }) => {
        if (options.model) {
          const maybeRealModel = this.modelAliases[options.model]
          if (maybeRealModel) {
            options.model = maybeRealModel
          }
        }
      })
      .action(async ({ session, options }, content) => {
        this.logger.info('[chat] input', options, content)

        const startTime = Date.now()
        const conversation_owner = session.user.id
        const userName = getUserNickFromSession(session)

        const conversation_id: string =
          (session.user.openai_last_conversation_id ||= crypto.randomUUID())

        const histories = await this.getChatHistoriesById(conversation_id)
        this.logger.info('[chat] user data', {
          conversation_owner,
          conversation_id,
          historiesLenth: histories.length,
        })

        const model = options.model || this.config.model || 'gpt-4o-mini'
        const stream = await this.openai.chat.completions.create(
          {
            model,
            messages: [
              // magic
              // {
              //   role: 'system',
              //   content: `You are ChatGPT, a large language model trained by OpenAI.\nKnowledge cutoff: 2021-09\nCurrent model: ${
              //     options.model || 'gpt-3.5-turbo'
              //   }\nCurrent time: ${new Date().toLocaleString()}`,
              // },
              // base prompt
              {
                role: 'system',
                content: options.prompt || this.SILI_PROMPT,
              },
              // provide user info
              {
                role: 'system',
                content: `The person talking to you: ${userName}\nCurrent time: ${new Date().toLocaleString()}\n`,
              },
              // chat history
              ...histories,
              // current user input
              { role: 'user', content },
            ],
            max_tokens: this.config.maxTokens ?? 1024,
            temperature: 0.9,
            presence_penalty: 0.6,
            frequency_penalty: 0,
            stream: true,
            stream_options: {
              include_usage: true,
            },
          },
          { timeout: 60 * 1000 }
        )

        // 读取流式数据
        let fullThinking = ''
        let fullContent = ''
        let sendContentFromIndex = 0
        let sendThinkingFromIndex = 0
        let usage: CompletionUsage | undefined
        let thinkingEnd = false
        const shouldSendThinking = options.debug

        // 如果没有开启调试模式，每思考 10 秒发送一个状态指示器
        let sendStatusIndicator = -1
        const indicators = ['181', '285', '267', '312', '284', '37']
        const interval = setInterval(() => {
          if (
            sendContentFromIndex ||
            sendThinkingFromIndex ||
            Date.now() - startTime > 60 * 1000
          ) {
            clearInterval(interval)
          } else {
            sendStatusIndicator = (sendStatusIndicator + 1) % indicators.length
            session.onebot?._request('set_msg_emoji_like', {
              message_id: session.messageId,
              emoji_id: indicators[sendStatusIndicator],
            })
          }
        }, 10 * 1000)

        // #region chat-stream
        for await (const chunk of stream) {
          if (chunk.usage) {
            usage = chunk.usage
          }
          const thinking: string =
            (chunk as any).choices?.[0]?.delta?.reasoning_content?.trim() || ''
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
              text && (await session.sendQueued('[内心独白] ' + text))
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
              await session.sendQueued(
                '[内心独白] ' + fullThinking.slice(sendThinkingFromIndex)
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
              await session.sendQueued(text)
            }
          }
        }
        //#endregion

        // 处理剩余的文本
        if (sendContentFromIndex < fullContent.length) {
          const text = fullContent.slice(sendContentFromIndex)
          this.logger.info('[chat] send remaining:', text)
          await session.sendQueued(text)
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

  async reviewConversation(
    base_prompt: string,
    user: string,
    assistant: string
  ) {
    return this.openai.chat.completions
      .create(
        {
          model: this.config.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: this.CENSOR_PROMPT,
            },
            {
              role: 'user',
              content: JSON.stringify({ base_prompt, user, assistant }),
            },
          ],
        },
        {
          timeout: 30 * 1000,
        }
      )
      .then((data) => {
        const text = data.choices?.[0]?.message?.content?.trim()
        console.info('[review]', text, data)
        return text === 'Y'
      })
      .catch((e) => {
        console.error('[review] ERROR', e)
        return true
      })
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

  async summarize(channelId: string) {
    const records = this.getRecords(channelId)
    if (records.length < 10) {
      return <>🥀啊哦——保存的聊天记录太少了，难以进行总结……</>
    }

    const recordsText = this.formatRecords(records)

    return this.openai.chat.completions
      .create(
        {
          model: this.config.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: this.CHAT_SUMMARY_PROMPT,
            },
            { role: 'user', content: recordsText },
          ],
          max_tokens: this.config.maxTokens ?? 500,
        },
        { timeout: 90 * 1000 }
      )
      .then((data) => {
        this.logger.info('chat-summary', data)
        const text = data.choices?.[0]?.message?.content?.trim()
        if (!text) {
          return (
            <>
              <p>💩噗通——进行总结时出现了一些问题：</p>
              <p>Error 返回结果为空</p>
            </>
          )
        }
        return (
          <>
            <p>[chat-summary] 下面是对最后{records.length}条聊天记录的总结：</p>
            <p></p>
            <p>{text}</p>
          </>
        )
      })
      .catch((e) => {
        return (
          <>
            <p>💩噗通——SILI猪脑过载！</p>
            <p>{'' + e}</p>
          </>
        )
      })
  }

  addRecord(session: Session) {
    const content = session.elements?.join('') || ''
    if (content.includes('[chat-summary]')) {
      return
    }
    const records = this.getRecords(session.channelId)
    records.push({ ...session.toJSON(), content })
    this.#chatRecords[session.channelId] = records.slice(
      records.length - this.config.recordsPerChannel
    )
  }
  getRecords(channelId: string): Session.Payload[] {
    this.#chatRecords[channelId] = this.#chatRecords[channelId] || []
    return this.#chatRecords[channelId]
  }
  formatRecords(records: Session.Payload[]) {
    return JSON.stringify(
      records.map((session) => {
        return {
          user: getUserNickFromSession(session),
          msg: session.content,
        }
      })
    )
  }
}
