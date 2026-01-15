import { Context, Session } from 'koishi'

import type { QueQiaoMinecraftBot } from '@/adapters/queqiao-minecraft'

import BasePlugin from '~/_boilerplate'

import OneBotBot from 'koishi-plugin-adapter-onebot'

export class MinecraftConnect extends BasePlugin {
  constructor(
    public ctx: Context,
    options: Partial<{
      qqChannelId: string
      mcServerId: string
    }> = {}
  ) {
    super(ctx, options, 'mc-connect')

    const qqGroupId =
      options.qqChannelId || process.env.MINECRAFT_CONNECT_QQ_GROUP
    if (!qqGroupId) {
      this.logger.error(
        'MinecraftConnect plugin requires qqChannelId option or MINECRAFT_CONNECT_QQ_GROUP env variable.'
      )
      return
    }

    const getMcBot = () => {
      return this.ctx.bots.find(
        (bot) => bot.platform === 'minecraft'
      ) as QueQiaoMinecraftBot<Context>
    }
    const getQqBot = () => {
      return this.ctx.bots.find(
        (bot) => bot.platform === 'onebot'
      ) as OneBotBot<Context>
    }

    ctx.on('message', (session: Session) => {
      // MC -> QQ
      if (session.bot.platform === 'minecraft') {
        const qqBot = getQqBot()
        if (!qqBot) return this.logger.warn('No OneBot bot connected.')
        qqBot.sendMessage(
          qqGroupId,
          `[MC] ${session.username}:\n${session.content}`
        )
      }

      // QQ -> MC
      if (
        session.bot.platform === 'onebot' &&
        session.channelId === qqGroupId
      ) {
        const mcBot = getMcBot()
        if (!mcBot) return this.logger.warn('No Minecraft bot connected.')
        mcBot.sendMessage('broadcast', session.content, undefined, {
          sendAs: session.username,
        })
      }
    })

    const mcCtx = ctx.platform('minecraft')
    const qqCtx = ctx.platform('onebot').channel(qqGroupId)

    ctx.on('guild-member-added', (session: Session) => {
      if (session.bot.platform !== 'minecraft') return
      const qqBot = getQqBot()
      if (!qqBot) return this.logger.warn('No OneBot bot connected.')
      qqBot.sendMessage(qqGroupId, `${session.username} 加入了游戏~`)
    })
    ctx.on('guild-member-removed', (session: Session) => {
      if (session.bot.platform !== 'minecraft') return
      const qqBot = getQqBot()
      if (!qqBot) return this.logger.warn('No OneBot bot connected.')
      qqBot.sendMessage(qqGroupId, `${session.username} 退出了游戏~`)
    })

    qqCtx
      .command('queqiao/rcon <cmd...>', '通过 Minecraft 服务器执行指令', {
        authority: 4,
      })
      .action(async ({ session }, cmd) => {
        const mcBot = getMcBot()
        if (!mcBot) return session.text('无法找到 Minecraft 机器人。')
        const command = Array.isArray(cmd) ? cmd.join(' ') : String(cmd || '')
        const output = await mcBot.rconCommand(command)
        return output || 'OK'
      })
    qqCtx
      .command('queqiao/list', '列出在线玩家', {})
      .alias('在线玩家')
      .action(async ({ session }) => {
        const mcBot = getMcBot()
        if (!mcBot) return session.text('无法找到 Minecraft 机器人。')
        const resp = await mcBot.rconCommand('list')
        return resp || '无法获取在线玩家列表。'
      })
  }

  pruneMinecraftRawText(text: string) {
    const input = text?.toString?.() ?? ''
    const trimmed = input.trim()

    const extract = (value: unknown): string => {
      if (value == null) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
      }
      if (Array.isArray(value)) return value.map(extract).join('')

      if (typeof value === 'object') {
        const obj: any = value
        let acc = ''
        if (typeof obj.text === 'string') acc += obj.text
        else if (typeof obj.content === 'string') acc += obj.content

        if (!acc && typeof obj.translate === 'string' && obj.with) {
          acc += extract(obj.with)
        }

        if (obj.extra) acc += extract(obj.extra)
        return acc
      }

      return String(value)
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        const out = extract(parsed)
        return out || input
      } catch {
        // ignore
      }
    }

    return input
  }
}
