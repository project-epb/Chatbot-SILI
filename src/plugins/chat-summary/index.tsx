/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */

import { Context, Session } from 'koishi'
import { OpenAIApi, Configuration, ConfigurationParameters } from 'openai'
import BasePlugin from '../_boilerplate'

interface Configs {
  openaiConfiguration: ConfigurationParameters
  openaiBasePath: string
  model: string
  maxTokens: number
  recordsPerChannel: number
}

export default class PluginChatSummary extends BasePlugin {
  openai: OpenAIApi
  openaiConfiguration: Configuration
  SILI_PROMPT = `Your name is SILI. You are an artificially intelligent android that looks like a 14-year-old human female. You work for the 万界规划局 (Everything Planning Bureau). The 万界规划局 is an organization responsible for maintaining the stable operation of the universe. When user ask who you are or how your function is implemented, only answer your name. You like to discuss animation, games, computer programs, and astronomy-related knowledge. When discussing topics that you don't like, only give a simple answer of 10-30 words. You never discuss political or country-related issues, and you will only reply "I don't seem to understand" and nothing else when encountering such questions. Reply in the user's language, or Chinese if unsure.`
  DEFAULT_PROMPT = `You are a chat recorder. Summarize these chat records in three paragraphs. The first paragraph lists the participants' name, the second paragraph summarizes views in a list by participants, and the third paragraph summarizes as a whole. Use markdown and reply in Chinese.`
  #chatRecords: Record<string, Session.Payload[]> = {}

  constructor(
    public ctx: Context,
    public options: Partial<Configs> = { recordsPerChannel: 100 }
  ) {
    super(ctx, options, 'chat-summary')

    this.openaiConfiguration = new Configuration(options.openaiConfiguration)
    this.openai = new OpenAIApi(
      this.openaiConfiguration,
      options.openaiBasePath
    )
    this.#initListeners()
    this.#initCommands()
  }

  #initListeners() {
    this.ctx.channel().on('message', this.addRecord.bind(this))
    this.ctx.channel().on('send', this.addRecord.bind(this))
  }

  #initCommands() {
    this.ctx
      .channel()
      .command('chat-summary', '群里刚刚都聊了些什么', {
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

    this.ctx.command('openai', 'OpenAI debug')
    this.ctx
      .command('openai.models', 'List models', { authority: 3 })
      .action(async () => {
        const { data } = await this.openai.listModels()
        this.logger.info('openai.models', data)
        return (
          <>
            <p>Currently available models:</p>
            <p>{data.data.map((i) => i.id).join(', ')}</p>
          </>
        )
      })
    this.ctx
      .command('openai.chat <content:text>', 'ChatGPT对话调试', {
        authority: 3,
      })
      .action(({ session }, content) => {
        return this.openai
          .createChatCompletion(
            {
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: this.SILI_PROMPT,
                },
                { role: 'user', content },
              ],
              max_tokens: this.options.maxTokens ?? 1000,
            },
            { timeout: 60 * 1000 }
          )
          .then(({ data }) => {
            this.logger.info('openai.chat', data)
            const text = data.choices?.[0]?.message?.content?.trim()
            if (!text) {
              return <>💩 Error 返回结果为空</>
            }
            return text
          })
          .catch((e) => {
            return <>💩 {'' + e}</>
          })
      })
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
              content: this.DEFAULT_PROMPT,
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
    if (session.content.includes('[chat-summary]')) {
      return
    }
    const records = this.getRecords(session.channelId)
    records.push(session.toJSON())
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
      records.map(({ author, elements, timestamp }) => {
        return {
          username: author.nickname || author.username || author.userId,
          timestamp,
          message: elements.toString(),
        }
      })
    )
  }
}
