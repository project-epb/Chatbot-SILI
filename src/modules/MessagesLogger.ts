/**
 * @name MessagesLogger
 * @desc 内部插件，收发消息记录日志
 */
import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class MessagesLogger extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'message')

    ctx.on('message', (session) => {
      const content = this.toSlimContent(session.content) || '[UNKNOWN]'
      this.logger.info(
        `${session.platform}${
          session.event.guild
            ? ` ▸ ${session.event.guild.name} (${session.event.guild.id})`
            : ''
        } ▸ ${session.username} (${session.userId})`,
        `⫸ ${content}`
      )
    })

    ctx.on('send', (session) => {
      const content = this.toSlimContent(session.content) || '[UNKNOWN]'
      ctx
        .logger('SEND')
        .info(
          `${session.platform} ▸ ${session.event?.channel?.name} (${session.event?.channel?.id})`,
          `⫸ ${content}`
        )
    })

    ctx.on('poke', (session) => {
      session.send('不许戳')
    })
  }

  /**
   * drop base64 image data
   */
  toSlimContent(content: string) {
    if (!content) return content
    return content.replace(
      /(src|url)="(base64:\/\/|data:).+?"/gi,
      'src="(base64)"'
    )
  }
}
