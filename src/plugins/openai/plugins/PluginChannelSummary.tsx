/**
 * 看看群友们都聊了什么勾八.jpg
 * @author dragon-fish
 * @license MIT
 */
import { Context, Session, Time } from 'koishi'

import BasePlugin from '~/_boilerplate'

import { OpenAI } from 'openai'

import type { Config as BaseConfig } from '..'

export declare const Config: BaseConfig

export default class PluginChannelSummary extends BasePlugin<BaseConfig> {
  static readonly inject = ['openai', 'messageRecord']
  readonly openai: OpenAI
  readonly SYSTEM_PROMPT: string
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

    this.#initCommands()
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
    const records =
      await this.ctx.messageRecord.getRecordsByChannelId(channelId)
    if (records.length < 10) {
      return <>🥀啊哦——保存的聊天记录太少了，难以进行总结……</>
    }

    const recordsText = JSON.stringify(records)

    return this.openai.chat.completions
      .create(
        {
          model: this.config.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: this.SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content:
                'Here are the chat logs exported in JSON format, please summarize them:\n' +
                recordsText,
            },
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
}
