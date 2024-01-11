/**
 * @name MessagesLogger
 * @desc 内部插件，收发消息记录日志
 */
import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class MessagesLogger extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'msg-log')

    ctx.on('message', (session) => {
      const content = this.toSlimContent(session.content) || '[UNKNOWN]'
      this.logger.info(
        `[${session.platform}]`,
        `[${session.subsubtype}/${session.channelId}]`,
        `${session.username} (${session.userId})`,
        `> ${content}`
      )
    })
    ctx.on('send', (session) => {
      // const seg = segment.parse(session.content)
      // seg.forEach((i, index) => {
      //   if (i.type === 'img' && i?.attrs?.src?.startsWith('base64://')) {
      //     seg[index].attrs.src = '(base64)'
      //   }
      // })
      const content = this.toSlimContent(session.content) || '[UNKNOWN]'
      ctx
        .logger('SEND')
        .info(
          `[${session.platform}]`,
          `[${session.type}/${session.channelId}]`,
          `${session.username} (${session.selfId})`,
          `> ${content}`
        )
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
