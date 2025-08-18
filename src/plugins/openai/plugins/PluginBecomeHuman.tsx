import { Context, Session } from 'koishi'

import BasePlugin from '@/plugins/_boilerplate'
import { safelyStringify } from '@/utils/safelyStringify'

import OpenAI from 'openai'

import PluginOpenAi, { Config as BaseConfig } from '..'

export default class PluginBecomeHuman extends BasePlugin<BaseConfig> {
  static readonly inject = ['openai', 'messageRecord']
  readonly openai: OpenAI
  private readonly DEFAULT_CONFIGS = {
    naturalRate: 0, // 普通消息触发概率
    mentionedRate: 1 / 2, // 如果被@，有更高的概率触发
    perChannelRate: {
      '1029954579': 1 / 10,
      '138516409': 1 / 20,
      '412024832': 1 / 50,
      '1026023666': 1 / 25,
    },
    minMessages: 15, // 至少需要 x 条消息才触发，否则难以接上话
    maxMessages: 50, // 携带消息上限，不能太高否则 token 会爆
  }
  private SYSTEM_PROMPT = PluginOpenAi.readPromptFile('become-human.md')

  constructor(ctx: Context, config: BaseConfig) {
    super(ctx, config, 'become-human')
    this.openai = ctx.root.openai
    this.#initCommands()
    this.#initListeners()
    this.logger.info('PluginBecomeHuman started')
  }

  #initCommands() {
    this.ctx
      .command('openai/become-human', '[debug] 假装人类进行发言', {
        hidden: true,
      })
      .action(async ({ session }) => {
        this.handleReply(session, true)
      })
  }

  #initListeners() {
    this.ctx.channel().on('message', (session) => {
      const isMentionedSelf = session.elements?.some(
        (i) => i.type === 'at' && i.attrs.id === '3338556752'
      )
      const rate = isMentionedSelf
        ? this.DEFAULT_CONFIGS.mentionedRate
        : this.DEFAULT_CONFIGS.perChannelRate[session.channelId] ||
          this.DEFAULT_CONFIGS.naturalRate
      const isHitRandom = Math.random() < rate
      if (isHitRandom) {
        this.handleReply(session)
      }
    })
  }

  async handleReply(session: Session, noExtraCheck = false) {
    const isMentionedSelf = session.elements?.some(
      (i) => i.type === 'at' && i.attrs.id === '3338556752'
    )
    const channelId = session.channelId
    let records = await this.ctx.messageRecord.getRecordsByChannelId(
      channelId,
      this.config.recordsPerChannel
    )
    if (!noExtraCheck) {
      // 过滤近期的消息，太久远的没有回复必要
      const now = Date.now()
      records = records.filter((i) => {
        const time = new Date(i.timestamp).getTime()
        const diff = now - time
        return diff < 3 * 60 * 60 * 1000
      })
      if (records.length < this.DEFAULT_CONFIGS.minMessages) {
        this.logger.info(
          '尝试成为人类',
          `频道 ${channelId} 消息不足，暂不触发。`
        )
        return
      }
      this.logger.info(`尝试成为人类`, {
        channelId,
        lastMessage: session.content,
      })
    }
    records = records.slice(-this.DEFAULT_CONFIGS.maxMessages)
    const recordText = records.map((i) => safelyStringify(i)).join('\n')

    let tips = '现在轮到你发言：'
    if (isMentionedSelf) {
      tips = '注意最后一条消息，有人@你了，现在你打算回复：'
    }

    const response = await this.openai.chat.completions.create(
      {
        model: 'xyj-volcengine.deepseek-r1-250528',
        temperature: 1.2,
        top_p: 0.6,
        presence_penalty: 0.8,
        stream: false,
        messages: [
          {
            role: 'system',
            content: this.SYSTEM_PROMPT,
          },
          {
            role: 'system',
            content: `可能有用的信息：
- 时间：${new Date().toISOString()}
- 时区：UTC+8 (Asia/Shanghai)`,
          },
          {
            role: 'user',
            content: `以下是 jsonc 格式的群内聊天记录：
${recordText}
----
${tips}`,
          },
        ],
      },
      { headers: {} }
    )

    const text = response?.choices?.[0]?.message?.content || ''
    console.log(response, text)
    if (!text || text.trim() === '##NO_REPLY##') return
    session.send(text)
  }
}
