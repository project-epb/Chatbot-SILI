/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */
import { Context, Session } from 'koishi'

import { writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import BasePlugin from '~/_boilerplate'

import { getUserNickFromSession } from '$utils/formatSession'
import { safelyStringify } from '$utils/safelyStringify'
import { OpenAI } from 'openai'

import type { Config as BaseConfig } from '..'

export declare const Config: BaseConfig

export default class PluginChannelSummary extends BasePlugin<BaseConfig> {
  static readonly inject = ['openai']
  readonly openai: OpenAI
  #chatRecords: Record<string, Session['event'][]> = {}

  constructor(ctx: Context, config: BaseConfig) {
    if (!config.systemPrompt?.chatSummary) {
      throw new Error('Required payloads: openai, systemPrompt.chatSummary', {
        cause: config,
      })
    }

    super(ctx, config, 'channel-summary')

    this.openai = this.ctx.openai
    this.#handleRecordsLog().then(() => {
      this.#initListeners()
      this.#initCommands()
    })
  }

  async #handleRecordsLog() {
    const logFile = resolve(__dirname, '..', 'records.log')
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
    this.ctx
      .channel()
      .command('openai/chat-summary', '群里刚刚都聊了些什么', {
        authority: 2,
      })
      .alias('总结聊天', '总结群聊')
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
              content: this.config.systemPrompt.chatSummary,
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
    const dump = session.toJSON()
    if (!dump?.message || !dump?.message?.content) {
      dump.message ||= {}
      dump.message.content = session.content
    }
    records.push(dump)
    this.#chatRecords[session.channelId] = records.slice(
      records.length - this.config.recordsPerChannel
    )
  }
  getRecords(channelId: string): Session['event'][] {
    this.#chatRecords[channelId] = this.#chatRecords[channelId] || []
    return this.#chatRecords[channelId]
  }
  formatRecords(records: Session['event'][]) {
    return JSON.stringify(
      records.map((session) => {
        return {
          username: getUserNickFromSession(session),
          content: (session as any)?.content || session?.message?.content,
        }
      })
    )
  }
}
