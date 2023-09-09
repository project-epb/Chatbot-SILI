import { Context, Session, Time, h } from 'koishi'
import BasePlugin from './_boilerplate'

declare module 'koishi' {
  interface Tables {
    mention_logs: MentionLog
  }
}

interface MentionLog {
  id: number
  author: string
  target: string
  content: string
  messageId: string
  channelId: string
  guildId: string
  platform: string
  timestamp: number
}

export default class PluginWhoAsked extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'who_asked')
    this.initDatabase()
    ctx.on('message', this.onMessage.bind(this))

    ctx
      .command('whoasked', '谁艾特我？', { minInterval: 10 * 1000 })
      .alias('谁艾特我', '谁@我', '谁at我')
      .action(async ({ session }) => {
        const dayAgo = Date.now() - 86400000
        const log = await this.findLastMention(session, dayAgo)
        if (!log) {
          return '谁问你了？'
        }
        return (
          <>
            <quote id={log.messageId} />
            请看这里，<at id={session.userId}></at>
            ！你在本频道最近一次被提及是在
            {Time.format(Date.now() - log.timestamp)}前~
            <p>
              有问题的话可以问问<at id={log.author}></at>哦~
            </p>
          </>
        )
      })

    ctx.middleware((session) => {
      const keywords = ['谁艾特我', '谁@我', '谁at我']
      if (keywords.some((keyword) => session.content.endsWith(keyword))) {
        session.execute({ name: 'whoasked' })
      }
    })
  }
  private initDatabase() {
    this.ctx.model.extend(
      'mention_logs',
      {
        id: 'integer',
        author: 'string',
        target: 'string',
        content: 'string',
        messageId: 'string',
        channelId: 'string',
        guildId: 'string',
        platform: 'string',
        timestamp: 'integer',
      },
      {
        primary: 'id',
        autoInc: true,
      }
    )
  }
  private onMessage(session: Session) {
    const [at] = h.select(session.elements, 'at')
    if (!at) {
      return this.logger.debug('message has not contains at')
    }
    const target = at.attrs.id || at.attrs.qq
    if (!target || target === session.bot.selfId) {
      return this.logger.debug('message missing target or target is bot itself')
    }
    this.ctx.database.create('mention_logs', {
      author: session.userId,
      target,
      content: session.content,
      messageId: session.messageId,
      channelId: session.channelId,
      guildId: session.guildId,
      platform: session.platform,
      timestamp: Date.now(),
    })
  }
  async findLastMention(session: Session, afterTime = 0) {
    return this.ctx.database
      .get(
        'mention_logs',
        {
          platform: session.platform,
          channelId: session.channelId,
          target: session.userId,
          timestamp: {
            $gt: afterTime,
          },
        },
        {
          limit: 1,
          sort: {
            timestamp: 'desc',
          },
        }
      )
      .then((logs) => logs?.[0])
  }
}
