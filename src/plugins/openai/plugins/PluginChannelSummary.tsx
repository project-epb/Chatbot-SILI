/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */
import { Context, Session, Time } from 'koishi'

import { writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
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
  readonly SYSTEM_PROMPT: string
  readonly LOG_FILE = resolve(__dirname, '..', 'channel-messages.log')
  private messageRecords: Record<string, Session['event'][]> = {}
  private readonly NO_RECORD_MAGIC_WORD = '[summary]'

  constructor(ctx: Context, config: BaseConfig) {
    if (!config.systemPrompt?.channelSummary) {
      throw new Error(
        'Required payloads: openai, systemPrompt.channelSummary',
        {
          cause: config,
        }
      )
    }

    super(ctx, config, 'channel-summary')

    this.openai = this.ctx.openai
    this.SYSTEM_PROMPT = this.config.systemPrompt.channelSummary
    this.#handleRecordsLog().then(() => {
      this.#initListeners()
      this.#initCommands()
    })
  }

  async #handleRecordsLog() {
    try {
      const text = (await readFile(this.LOG_FILE)).toString()
      const obj = JSON.parse(text)
      this.messageRecords = obj
    } catch (_) {
      writeFile(this.LOG_FILE, '{}', 'utf-8').catch(() => {})
    }

    process.on('exit', () => {
      try {
        writeFileSync(
          this.LOG_FILE,
          safelyStringify(this.messageRecords),
          'utf-8'
        )
      } catch (e) {
        console.error('[channel-summary] Failed to write log file:', e)
      }
    })
  }

  #initListeners() {
    this.ctx.channel().on('message', this.logSessionData.bind(this))
    this.ctx.channel().on('send', this.logSessionData.bind(this))
  }

  #initCommands() {
    this.ctx
      .channel()
      .command('openai/channel-summary', '群里刚刚都聊了些什么', {
        minInterval: 5 * Time.minute,
        maxUsage: 5,
        bypassAuthority: 2,
      })
      .alias('summary', '总结聊天', '总结群聊')
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
    const records = this.getRecordsByChannelId(channelId)
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
              content: this.SYSTEM_PROMPT,
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
            <p>
              {this.NO_RECORD_MAGIC_WORD} 下面是对最后{records.length}
              条聊天记录的总结：
            </p>
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

  logSessionData(session: Session) {
    const content = session.elements?.join('') || ''
    if (content.includes(this.NO_RECORD_MAGIC_WORD)) {
      return
    }
    const records = this.getRecordsByChannelId(session.channelId)
    const dump = session.toJSON()
    if (!dump?.message || !dump?.message?.content) {
      dump.message ||= {}
      dump.message.content = session.content
    }
    records.push(dump)
    this.messageRecords[session.channelId] = records.slice(
      records.length - this.config.recordsPerChannel
    )
  }
  getRecordsByChannelId(channelId: string): Session['event'][] {
    this.messageRecords[channelId] = this.messageRecords[channelId] || []
    return this.messageRecords[channelId]
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
