/**
 * @name mute
 * @command channel.mute
 * @desc 设置群组成员禁言/全员禁言
 * @authority 3
 */
import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class PluginMute extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'mute')

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
}
