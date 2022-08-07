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
        `[${session.subsubtype}/${session.subsubtype}]`,
        `[${session.channelId}@${session.platform}]`,
        '> ' + session.content
      )
    })
  }
  get logger() {
    return this.ctx.logger('MESSAGE')
  }
}
