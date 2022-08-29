/**
 * @name _internal-FandomDiscordConnect
 * @command -
 * @internal true
 * @desc Fandom QQ群↔Discord 消息互联
 * @authority -
 */

import { Context, segment, Session } from 'koishi'
import axios from 'axios'
import { resolveBrackets } from '../utils/resolveBrackets'
import {} from '@koishijs/plugin-teach'

export const name = '_internal-FandomDiscordConnect'

export default class FandomDiscordConnect {
  constructor(public ctx: Context) {
    // 缓存上下文
    const ctxQQ = ctx
        .platform('onebot')
        .channel(process.env.CHANNEL_QQ_FANDOM as string),
      ctxDC = ctx
        .platform('discord')
        .channel('736880471891378246', '568268934176964629')

    // QQ 收到消息
    ctxQQ.on('message', (session: Session) => {
      this.qqToDiscord(
        session,
        process.env.WEBHOOK_DISCORD_FANDOM_ZH_CONNECT as string
      )
    })

    // QQ 自己发消息
    ctxQQ.on('send', (session) => {
      this.qqToDiscord(
        session,
        process.env.WEBHOOK_DISCORD_FANDOM_ZH_CONNECT as string
      )
    })

    // Discord 收到消息
    ctxDC.on('message', (session) => {
      if (
        // QQ推送Hook
        session.author?.userId !== '736880520297971714' // &&
        // 研讨会Hook
        // session.author.userId !== '865799566417854524'
      ) {
        this.discordToQQ(session, process.env.CHANNEL_QQ_FANDOM as string)
      }

      // Discord 自己发消息
      ctxDC.on('send', (session) => {
        this.discordToQQ(session, process.env.CHANNEL_QQ_FANDOM as string)
      })
    })

    // 防止自触发
    ctx
      .platform('discord')
      .before('command/execute', ({ session }) =>
        this.isDiscordBot(session!) ? '' : void 0
      )
    ctx
      .platform('discord')
      // @ts-ignore
      .on('dialogue/before-send', ({ session }) =>
        this.isDiscordBot(session) ? true : void 0
      )
  }

  discordToQQ(session: Session, channelId: string) {
    if (/(%disabled%|__noqq__)/i.test(session.content as string)) return
    if (/^\[qq\]/i.test(session.content as string)) return

    let content = session.content as string
    const sender = `${session.author?.nickname || session.author?.username}#${
      session.author?.discriminator || '0000'
    }`
    // content = parseDiscordImages({ session, content })
    content = this.parseDiscordEmoji(content)
    const finalMsg = [`[Discord] ${sender}`, content].join('\n')

    this.ctx.bots
      .find((i) => i.platform === 'onebot')
      ?.sendMessage(channelId, finalMsg)

    this.logger.debug('⇿', 'Discord信息已推送到QQ', sender, session.content)
  }

  async qqToDiscord(session: Session, webhook: string) {
    let message = session.content as string
    message = resolveBrackets(message)
    if (/^\[discord\]/i.test(message) || /__nodc__/gi.test(message)) return

    let send = ''
    if (/\[cq:image,.+\]/gi.test(message)) {
      let image = message.replace(
        /(.*?)\[cq:image.+,url=(.+?)\](.*?)/gi,
        '$1 $2 $3'
      )
      send += image
    } else {
      send += message
    }
    send = send.replace(/\[cq:at,qq=(.+?)\]/gi, '`@$1`')

    if (/\[cq:reply.+\]/i.test(message)) {
      let replyMsg = ''
      const replySeg = segment.parse(/\[cq:reply.+?\]/i.exec(message)![0])
      const replyId = replySeg?.[0]?.data?.id || ''
      const replyMeta = await session.bot.getMessage(
        session.channelId as string,
        replyId
      )

      let replyTime = new Date('' + replyMeta.timestamp),
        replyDate = `${replyTime.getHours()}:${replyTime.getMinutes()}`

      replyMsg = replyMeta.content as string
      replyMsg = resolveBrackets(replyMsg)
      replyMsg = replyMsg.split('\n').join('\n> ')
      replyMsg = '> ' + replyMsg + '\n'
      replyMsg =
        `> **__回复 ${
          replyMeta.author?.nickname || replyMeta.author?.username
        } 在 ${replyDate} 的消息__**\n` + replyMsg
      send = send.replace(/\[cq:reply.+?\]/i, replyMsg)
    }

    // 安全性问题
    send = send.replace(/@everyone/g, '@ everyone').replace(/@here/g, '@ here')

    // console.log('isReply', send)

    let nickname = ''
    let id = session.author?.userId as string
    nickname += session?.author?.username || '[UNKNOWN_USER_NAME]'
    nickname += ` (${id})`
    const body = {
      username: nickname,
      content: send,
      avatar_url: `http://q1.qlogo.cn/g?b=qq&nk=${id}&s=640`,
    }

    axios
      .post(webhook, body, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then(() => {
        this.logger.debug('⇿', 'QQ消息已推送到Discord')
      })
      .catch((err) => {
        this.logger.error(err)
      })
  }

  parseDiscordEmoji(msg: string) {
    return msg.replace(
      /\[CQ:face,id=(.+?),.+\]/gi,
      '[CQ:image,file=https://discord-emoji.vercel.app/api/emojis/$1]'
    )
  }

  isDiscordBot(session: Session) {
    return !!(
      session.author?.isBot ||
      !session.author?.discriminator ||
      session.author.discriminator === '0000'
    )
  }

  get logger() {
    return this.ctx.logger('DISCORD_CONNECT')
  }
}
