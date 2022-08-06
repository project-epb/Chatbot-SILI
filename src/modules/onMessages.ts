import { Context } from 'koishi'

export const name = '_internal-MessagesLogger'

export default class MessagesLogger {
  constructor(public ctx: Context) {
    ctx.on('message', (session) => {
      this.logger.info(
        `[${session.type}/${session.subsubtype || '-'}]`,
        `[${session.channelId}@${session.platform}]`,
        '> ' + session.content
      )
    })
  }
  get logger() {
    return this.ctx.logger('MESSAGE')
  }
}
