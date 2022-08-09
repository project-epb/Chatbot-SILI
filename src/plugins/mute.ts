/**
 * @name mute
 * @command channel.mute
 * @desc 设置群组成员禁言/全员禁言
 * @authority 3
 */

import { Context } from 'koishi'

export default class PluginMute {
  constructor(public ctx: Context) {
    ctx = ctx.platform('onebot').channel()
    ctx
      .command('channel.mute', '<duration:number>', { authority: 3 })
      .option('set-user', '-u <user:user>')
      .option('set-all', '-a', { type: 'boolean' })
      .action(({ session, options }, duration) => {
        this.logger.info(options, duration)
        if (options!['set-all']) {
          session!.bot.internal.setGroupWholeBan(
            session!.channelId,
            +duration > 0
          )
        }
        if (options!['set-user']) {
          session!.bot.internal.setGroupBan(
            session!.channelId,
            session!.userId,
            +duration
          )
        }
      })
  }

  get logger() {
    return this.ctx.logger('MUTE')
  }
}
