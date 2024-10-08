import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export class PluginDebug extends BasePlugin {
  constructor(ctx: Context) {
    super(ctx, {}, 'plugin-debug')

    ctx.command('debug', 'SILI debug commands', { authority: 3, hidden: true })

    ctx.inject(['piggyback'], (ctx) => {
      ctx
        .command('debug.piggyback <command:text>', 'Run as another user', {
          authority: 4,
        })
        .alias('debug.runas')
        .option('user', '-u <user:user>')
        .action(({ session, options }, command) => {
          if (!command) return session.execute('help debug.piggyback')

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

    ctx
      .platform('onebot')
      .command('debug.face', '<faceId:posint> Send QQ face', {})
      .action((_, faceId) => {
        const numId = parseInt(faceId)
        if (isNaN(numId) || numId < 1) return 'Invalid face ID.'
        return <face id={numId} />
      })
  }
}
