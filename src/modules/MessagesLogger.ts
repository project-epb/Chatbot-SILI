/**
 * @name _internal-MessagesLogger
 * @command -
 * @internal true
 * @desc 内部插件，收发消息记录日志
 * @authority -
 */

import { Context } from 'koishi'

export const name = '_internal-MessagesLogger'

export default class MessagesLogger {
  constructor(public ctx: Context) {
    ctx.on('message', (session) => {
      this.logger.info(
        `[${session.platform}]`,
        `[${session.subsubtype}/${session.channelId}]`,
        `${session.username} (${session.userId})`,
        '> ' + session.content
      )
    })
    ctx.on('send', (session) => {
      ctx
        .logger('SEND')
        .info(
          `[${session.platform}]`,
          `[${session.type}/${session.channelId}]`,
          `${session.username} (${session.selfId})`,
          '> ' +
            session.content?.replace(
              /\[CQ:image,file=base64:\/\/.+?]/g,
              '[CQ:image,file=<!-- base64 -->]'
            )
        )
    })
  }
  get logger() {
    return this.ctx.logger('MESSAGE')
  }
}
