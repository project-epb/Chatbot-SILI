/**
 * @name ProcessErrorHandler
 * @command -
 * @internal
 * @desc 这是一个插件
 * @authority -
 */

import { Context } from 'koishi'
import { randomUUID } from 'crypto'
import BasePlugin from '~/_boilerplate'

export default class ProcessErrorHandler extends BasePlugin {
  static EVENT_LIST = ['unhandledRejection', 'uncaughtException']

  constructor(public ctx: Context) {
    super(ctx, {}, 'process-error-handler')

    ProcessErrorHandler.EVENT_LIST.forEach((i) =>
      process.on(i, (event) => this.hadnler(event))
    )
  }

  hadnler(event: any) {
    const today = new Date().toISOString().split('T')[0]
    const eventId = randomUUID()
    this.logger.error(`\n${today} ${eventId} > `, event)
    const bot = this.ctx.bots.find((i) => i.platform === 'onebot')
    bot &&
      bot?.sendPrivateMessage(
        process.env.ACCOUNT_QQ_XIAOYUJUN as string,
        `[PROCESS_ERROR]\n${event.name}: ${
          event?.message || 'UNKNOWN'
        }\nEvent ID: ${today} ${eventId}`
      )
  }
}
