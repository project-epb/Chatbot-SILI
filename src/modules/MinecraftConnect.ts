import { Context } from 'koishi'

import { MinecraftBot } from '@/plugins/adapter-minecraft'

import BasePlugin from '~/_boilerplate'

export class MinecraftConnect extends BasePlugin {
  constructor(
    public ctx: Context,
    options
  ) {
    super(ctx, options, 'mc-connect')

    const QQ_GROUP = process.env.CHANNEL_QQ_NGNL_MINECRAFT

    const qqBot = ctx.bots.find((bot) =>
      ['onebot', 'red'].includes(bot.platform)
    )
    const qqCtx = ctx.channel(QQ_GROUP)
    const mcBot = ctx.bots.find(
      (bot) => bot.platform === 'minecraft'
    ) as MinecraftBot<Context>
    const mcCtx = ctx.platform('minecraft')

    mcCtx.on('message', (session) => {
      qqBot.sendMessage(
        QQ_GROUP,
        `[MC] ${session.username}:\n${session.content}`
      )
    })
    qqCtx.on('message', (session) => {
      mcBot.sendMessageAs(session.username, session.content)
    })
  }
}
