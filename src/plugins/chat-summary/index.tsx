/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */

import { Context, h, Session } from 'koishi'
import { OpenAIApi, Configuration, ConfigurationParameters } from 'openai'

interface Configs {
  openaiConfiguration: ConfigurationParameters
  openaiBasePath: string
  model: string
  maxTokens: number
  recordsPerChannel: number
}

export default class PluginChatSummary {
  openai: OpenAIApi
  openaiConfiguration: Configuration
  DEFAULT_PROMPT = `Summarize these chat records in three paragraphs. The first paragraph lists the main participants, the second paragraph summarizes views in a list by users, and the third paragraph summarizes as a whole. Use markdown and reply in Chinese:`
  #chatRecords: Record<string, Session.Payload[]> = {}

  constructor(
    public ctx: Context,
    public options: Partial<Configs> = { recordsPerChannel: 100 }
  ) {
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
      .alias('总结聊天记录', '刚刚群里聊了什么')
      .action(async ({ session }) => {
        session.send(h.quote(session.messageId) + '稍等，让我看看聊天记录……')
        const msg = await this.summarize(session.channelId)
        return msg
      })
  }

  async summarize(channelId: string) {
    const records = this.getRecords(channelId)
    if (records.length < 10) {
      return '🥀啊哦——保存的聊天记录太少了，难以进行总结……'
    }

    const recordsText = this.formatRecords(records)

    return this.openai
      .createCompletion({
        model: 'text-davinci-003',
        prompt: `${this.DEFAULT_PROMPT}\n${recordsText}`,
        max_tokens: this.options.maxTokens ?? 500,
      })
      .then(({ data }) => {
        const text = data.choices?.[0]?.text?.trim()
        if (!text) {
          return '💩噗通——进行总结时出现了一些问题：\nError 返回结果为空'
        }
        return `下面是对最后${records.length}条聊天记录的总结：\n\n${text}`
      })
      .catch((e) => {
        return `💩噗通——进行总结时出现了一些问题：\n${e}`
      })
  }

  addRecord(session: Session) {
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
    return records
      .map(({ author, elements }) => {
        return `${
          author.nickname || author.username || author.userId
        }\n${elements}`
      })
      .join('\n\n')
  }
}
