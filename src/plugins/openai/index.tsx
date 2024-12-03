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
import { CompletionUsage } from 'openai/resources'

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
  time: number
}

export interface Config {
  openaiOptions: ClientOptions
  model: string
  maxTokens: number
  recordsPerChannel: number
}

export default class PluginOpenAi extends BasePlugin {
  static inject = ['html', 'database']

  openai: OpenAI
  openaiOptions: ClientOptions
  SILI_PROMPT = PluginOpenAi.readPromptFile('SILI-v2.md')
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

        return this.openai.chat.completions
          .create(
            {
              model: options.model || this.config.model || 'gpt-4o-mini',
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
              max_tokens: this.config.maxTokens ?? 1000,
              temperature: 0.9,
              presence_penalty: 0.6,
              frequency_penalty: 0,
            },
            { timeout: 30 * 1000 }
          )
          .then(async (data) => {
            this.logger.info('[chat] output', data)
            const text = data.choices?.[0]?.message?.content?.trim()
            if (!text) {
              return (
                <>
                  <quote id={session.messageId}></quote>
                  {options.debug
                    ? '💩 Error 返回结果为空'
                    : this.RANDOM_ERROR_MSG}
                </>
              )
            }

            // if (session.user.authority < 2) {
            //   const good = await this.reviewConversation(
            //     options.prompt || this.SILI_PROMPT,
            //     content,
            //     text
            //   )
            //   if (!good) {
            //     return '呜……SILI不喜欢这个话题，我们可以聊点别的吗？'
            //   }
            // }

            // save conversations to database
            ;[
              { role: 'user', content, time: startTime },
              {
                role: 'assistant',
                content: text,
                time: Date.now(),
                usage: data.usage,
              },
            ].forEach((item) =>
              // @ts-ignore
              this.ctx.database.create('openai_chat', {
                ...item,
                conversation_owner,
                conversation_id,
              })
            )

            if (!options.debug) {
              return text
            }

            const img = await this.ctx.html.hljs(
              JSON.stringify(data, null, 2),
              'json'
            )
            return img
          })
          .catch((e) => {
            this.logger.error('[chat] error', e)
            return (
              <>
                <quote id={session.messageId}></quote>
                {options.debug ? <>💩 {e}</> : this.RANDOM_ERROR_MSG}
              </>
            )
          })
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
