import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export class PluginDebug extends BasePlugin {
  constructor(ctx: Context) {
    super(ctx, {}, 'plugin-debug')

    ctx.inject(['piggyback'], (ctx) => {
      ctx
        .command(
          'debug.piggyback <command:text>',
          'Piggyback to another user',
          {
            authority: 4,
          }
        )
        .option('user', '-u <user:user>')
        .action(({ session, options }, command) => {
          if (!command) return 'No command specified.'
          const { user } = options
          if (!user) return 'No user specified.'
          const index = user.indexOf(':')
          const uin = user.slice(index + 1)
          if (uin === session.userId) {
            return 'You cannot piggyback to yourself.'
          }
          session.executeAsUser(uin, command)
        })
    })
  }
}
