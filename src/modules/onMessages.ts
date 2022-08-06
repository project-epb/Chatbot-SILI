import { Context } from 'koishi'

export const name = '_internal-MessagesLogger'

export default class MessagesLogger {
  ctx: Context
  constructor(ctx: Context) {
    this.ctx = ctx
    ctx.on('message', (session) => {
      this.logger.info(
        `[${session.platform}:${session.userId}]`,
        `${session.type} / ${session.subsubtype || '-'}`,
        session.content
      )
    })
  }
  get logger() {
    return this.ctx.logger('MESSAGE')
  }
}
