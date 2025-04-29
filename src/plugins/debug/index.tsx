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

    ctx.inject(['qqntEmojiReaction'], (ctx) => {
      ctx
        .platform('onebot')
        .command('debug.reaction', 'Emoji reaction', {})
        .option('add', '-a <faceId:posint> Add reaction')
        .option('remove', '-r <faceId:posint> Remove reaction')
        .example(
          'If no action is specified, it will fetch the reactions from the message'
        )
        .action(({ session, options }) => {
          const msgId = session.quote?.id || session.messageId
          if (options.add) {
            return session
              .setReaction?.(options.add.toString())
              .then(() => '')
              .catch((e) => {
                return '失败：' + e.message
              })
          } else if (options.remove) {
            return session
              .removeReaction?.(options.remove.toString())
              .then(() => '')
              .catch((e) => {
                return '失败：' + e.message
              })
          } else {
            return this.ctx.qqntEmojiReaction
              .fetchReactions(msgId, session)
              .then((reactions) => {
                return JSON.stringify(reactions, null, 2)
              })
              .catch((e) => {
                return '失败：' + e.message
              })
          }
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
