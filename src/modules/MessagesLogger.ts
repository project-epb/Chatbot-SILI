/**
 * @name _internal-MessagesLogger
 * @command -
 * @internal true
 * @desc 内部插件，收发消息记录日志
 * @authority -
 */

import { Context, segment } from 'koishi'

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
      // const seg = segment.parse(session.content)
      // seg.forEach((i, index) => {
      //   if (i.type === 'img' && i?.attrs?.src?.startsWith('base64://')) {
      //     seg[index].attrs.src = '(base64)'
      //   }
      // })
      const content = session.content.replace(
        /src="(base64:\/\/|data:).+?"/gi,
        'src="(base64)"'
      )
      ctx
        .logger('SEND')
        .info(
          `[${session.platform}]`,
          `[${session.type}/${session.channelId}]`,
          `${session.username} (${session.selfId})`,
          '> ' + content
        )
    })
  }
  get logger() {
    return this.ctx.logger('MESSAGE')
  }
}
