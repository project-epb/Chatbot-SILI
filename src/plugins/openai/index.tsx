/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */

import { Context, Session, Time, h } from 'koishi'
import { OpenAIApi, Configuration, ConfigurationParameters } from 'openai'
import BasePlugin from '../_boilerplate'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { readFile } from 'fs/promises'
import crypto from 'crypto'

declare module 'koishi' {
  interface Tables {
    openai_chat: OpenAIConversationLog
  }
}

interface OpenAIConversationLog {
  conversation_id: string
  conversation_owner: string
  role: 'system' | 'user' | 'assistant'
  content: string
  time: number
}

interface Configs {
  openaiConfiguration: ConfigurationParameters
  openaiBasePath: string
  model: string
  maxTokens: number
  recordsPerChannel: number
}

export default class PluginOpenAi extends BasePlugin {
  static using = ['html']
  openai: OpenAIApi
  openaiConfiguration: Configuration
  /** =========================================== */
  SILI_PROMPT = readFileSync(resolve(__dirname, './prompts/SILI.txt'), {
    encoding: 'utf-8',
  })
    .toString()
    .trim()
  /** =========================================== */
  CHAT_SUMMARY_PROMPT = `You are a chat recorder. Summarize these chat records in three paragraphs. The first paragraph lists the participants' name, the second paragraph summarizes views in a list by participants, and the third paragraph summarizes as a whole. Use markdown and reply in Chinese.`
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
    public ctx: Context,
    public options: Partial<Configs> = { recordsPerChannel: 100 }
  ) {
    super(ctx, options, 'openai')

    this.openaiConfiguration = new Configuration(options.openaiConfiguration)
    this.openai = new OpenAIApi(
      this.openaiConfiguration,
      options.openaiBasePath
    )
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
        id: 'number',
        conversation_id: 'string',
        conversation_owner: 'string',
        role: 'string',
        content: 'string',
        time: 'number',
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
        writeFileSync(logFile, safeJSONStringify(this.#chatRecords))
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
        const { data } = await this.openai.listModels()
        this.logger.info('openai.models', data)
        return (
          <>
            <p>Currently available models:</p>
            <p>{data.data.map((i) => i.id).join('\n')}</p>
          </>
        )
      })

    this.ctx
      .command('openai/chat <content:text>', 'ChatGPT', {
        minInterval: 1 * Time.minute,
        bypassAuthority: 3,
      })
      .shortcut(/(.+)[?？]$/, {
        args: ['$1'],
        prefix: true,
      })
      .option('prompt', '-p <prompt:string>', {
        hidden: true,
        authority: 3,
      })
      .option('model', '-m <model:string>', {
        hidden: true,
        authority: 3,
      })
      .option('debug', '-d', { hidden: true, authority: 3 })
      .userFields(['name', 'openai_last_conversation_id'])
      .action(async ({ session, options }, content) => {
        this.logger.info('[chat] input', options, content)

        const startTime = Date.now()
        const conversation_owner = `${session.platform}:${session.userId}`
        const userName =
          session.user?.name ||
          session.author?.nickname ||
          session?.author?.username ||
          'user'

        const conversation_id: string =
          (session.user.openai_last_conversation_id ||= crypto.randomUUID())

        const histories = await this.getChatHistoriesById(conversation_id)
        this.logger.info('[chat] user data', {
          conversation_owner,
          conversation_id,
          historiesLenth: histories.length,
        })

        return this.openai
          .createChatCompletion(
            {
              model: options.model || 'gpt-3.5-turbo',
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
              max_tokens: this.options.maxTokens ?? 1000,
              temperature: 0.9,
              presence_penalty: 0.6,
              frequency_penalty: 0,
            },
            { timeout: 30 * 1000 }
          )
          .then(async ({ data }) => {
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

            // save conversations to database
            ;[
              { role: 'user', content, time: startTime },
              { role: 'assistant', content: text, time: Date.now() },
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
            return h.image(img, 'image/jpeg')
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
        session.user.openai_last_conversation_id = ''
        return '让我们开始新话题吧！'
      })
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

    return this.openai
      .createChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: this.CHAT_SUMMARY_PROMPT,
            },
            { role: 'user', content: recordsText },
          ],
          max_tokens: this.options.maxTokens ?? 500,
        },
        { timeout: 90 * 1000 }
      )
      .then(({ data }) => {
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
    const content = session.content
    if (content.includes('[chat-summary]')) {
      return
    }
    const records = this.getRecords(session.channelId)
    records.push({ ...session.toJSON(), content })
    this.#chatRecords[session.channelId] = records.slice(
      records.length - this.options.recordsPerChannel
    )
  }
  getRecords(channelId: string): Session.Payload[] {
    this.#chatRecords[channelId] = this.#chatRecords[channelId] || []
    return this.#chatRecords[channelId]
  }
  formatRecords(records: Session.Payload[]) {
    return JSON.stringify(
      records.map(({ author, content }) => {
        return {
          user: author.nickname || author.username || author.userId,
          msg: content,
        }
      })
    )
  }
}

function safeJSONStringify(obj: any, space = 0) {
  const visited = new WeakSet()

  function replacer(key, value) {
    // 处理 BigInt
    if (typeof value === 'bigint') {
      return value.toString()
    }

    // 处理自循环引用
    if (typeof value === 'object' && value !== null) {
      if (visited.has(value)) {
        return '<circular>'
      }
      visited.add(value)
    }

    return value
  }

  return JSON.stringify(obj, replacer, space)
}
