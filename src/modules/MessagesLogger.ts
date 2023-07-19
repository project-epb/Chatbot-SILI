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
      //   if (i.type === 'image' && i?.attrs?.url?.startsWith('base64://')) {
      //     seg[index].attrs.url = '(base64)'
      //   }
      // })
      const content = session.content.replace(
        /url="(base64:\/\/|data:).+?"/gi,
        'url="(base64)"'
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
