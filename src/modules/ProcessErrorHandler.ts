/**
 * @name ProcessErrorHandler
 * @command -
 * @internal
 * @desc 这是一个插件
 * @authority -
 */

import { Context } from 'koishi'
import { randomUUID } from 'crypto'

export default class ProcessErrorHandler {
  static CATCHES = ['unhandledRejection', 'uncaughtException']

  constructor(public ctx: Context) {
    ProcessErrorHandler.CATCHES.forEach((i) =>
      process.on(i, (event) => this.hadnler(event))
    )
  }

  hadnler(event: any) {
    const today = new Date().toISOString().split('T')[0]
    const eventId = randomUUID()
    this.logger.error(`\n${today} ${eventId} > `, event)
    const bot = this.ctx.bots.find((i) => i.platform === 'onebot')
    bot.isActive &&
      bot?.sendPrivateMessage(
        process.env.ACCOUNT_QQ_XIAOYUJUN as string,
        `[PROCESS_ERROR]\n${event.name}: ${
          event?.message || 'UNKNOWN'
        }\nEvent ID: ${today} ${eventId}`
      )
  }

  get logger() {
    return this.ctx.logger('PROCESS_ERROR')
  }
}
