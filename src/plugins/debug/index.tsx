import { Context, h } from 'koishi'

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

    ctx
      .platform('onebot')
      .command('debug.reaction', '<faceId:posint> Set reaction', {})
      .action(({ session }, faceId) => {
        const numId = parseInt(faceId)
        const msgId = session.quote?.id || session.messageId
        if (isNaN(numId) || numId < 1) return 'Invalid face ID.'
        return session.onebot
          ?._request('set_msg_emoji_like', {
            message_id: msgId,
            emoji_id: faceId,
          })
          .then(() => '')
          .catch((e) => {
            return '失败：' + e.message
          })
      })

    ctx.inject(['html'], (ctx) => {
      ctx
        .command('debug.inspect', 'Inspect session data', {
          authority: 3,
        })
        .action(async ({ session }) => {
          if (!session.quote) return 'No quote found.'
          const img = await ctx.html.shiki(
            JSON.stringify(session.quote, null, 2),
            'json'
          )
          return img ? h.img(img, 'image/jpeg') : 'Failed to render.'
        })
    })
  }
}
