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

    ctx = ctx.platform('red').channel()
    ctx
      .command('channel.mute', '<duration:number>', { authority: 3 })
      .option('set-user', '-u <user:user>')
      .option('set-all', '-a', { type: 'boolean' })
      .action(({ session, options }, duration) => {
        this.logger.info(options, duration)
        if (options!['set-all']) {
          session.bot.internal?.muteGroup({
            group: session!.channelId,
            enable: +duration > 0,
          })
        }
        if (options!['set-user']) {
          session.bot.internal?.muteGroupMembers({
            group: session!.channelId,
            memList: [
              {
                uin: session!.userId,
                timeStamp: +duration,
              },
            ],
          })
        }
      })
  }
}
