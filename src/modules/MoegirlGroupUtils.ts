/**
 * @name _internal-MgpGroupUtils
 * @command -
 * @internal true
 * @desc 内部插件，萌娘百科B站粉丝群工具箱
 * @authority -
 */

import { Context, segment, Time } from 'koishi'
import {} from '@koishijs/plugin-adapter-onebot'
import {} from '@koishijs/plugin-database-mongo'

interface SpamLog {
  time: string
  match: string[]
  content: string
  channelId: string
}
declare module 'koishi' {
  interface User {
    mgpGroupSpamLogs: SpamLog[]
  }
}

const MUTE_DURATION = [0, 10 * Time.minute, 2 * Time.hour, 1 * Time.day]

// Constants
const KEYWORDS_BLACKLIST = JSON.parse(
  process.env.MOEGIRL_KEYWORDS_BLACKLIST || '[]'
)
const COMMAND_WHITELIST = [
  // functions
  // 'wiki',
  // utils
  'ping',
  'dialogue',
  'teach',
  'schedule',
  'queue',
  'help',
  'switch',
  // administration
  'sudo',
  'echo',
  'auth',
  'user',
  'channel',
  'dbadmin',
  'siliname',
  'mute',
  'recall',
  'profile',
]
// const EXCEPTION_USERS = []

// Cache RegExp
const KEYWORDS_BLACKLIST_REG = new RegExp(
  `(${KEYWORDS_BLACKLIST.join('|')})`,
  'i'
)
const COMMAND_THITELIST_REG = new RegExp(`^(${COMMAND_WHITELIST.join('|')})`)

export default class MoegirlGroupUtils {
  constructor(public ctx: Context) {
    ctx.model.extend('user', {
      mgpGroupSpamLogs: 'list',
    })

    ctx = ctx.channel(
      ...(process.env.CHANNEL_QQ_MOEGIRL_BFANS as string).split('|')
    )

    // 指令白名单
    ctx.on('command/before-execute', ({ command }) => {
      if (!COMMAND_THITELIST_REG.test(command!.name)) {
        this.logger.info(command!.name, '指令不在白名单，已阻断。')
        return ''
      }
    })

    // 自动禁言
    ctx.on('message', async (sess) => {
      const textSegs = segment.select(sess.elements!, 'text')
      const match = KEYWORDS_BLACKLIST_REG.exec(textSegs.join(' ') || '')
      if (!match || sess.author?.roles?.find((i) => i === 'admin')) {
        return
      }

      let { mgpGroupSpamLogs } = await sess.app.database.getUser(
        sess.platform,
        sess.userId as string,
        ['mgpGroupSpamLogs']
      )
      // sess.app.database.getChannel(sess.platform,sess.channelId)
      ;(mgpGroupSpamLogs = mgpGroupSpamLogs || []).push({
        time: new Date().toISOString(),
        match,
        content: sess.content as string,
        channelId: sess.channelId as string,
      })

      const count = mgpGroupSpamLogs.length
      const duration = MUTE_DURATION[count]
        ? MUTE_DURATION[count] / 1000
        : Infinity

      const log = [
        `B群触发关键词黑名单:`,
        `channel: ${sess.channelId} (${sess.channelName || '未知群名'})`,
        `user: ${sess.userId} (${sess.author?.nickname || '未知昵称'})`,
        `keywords: ${match[1]}`,
        `${sess.content}`,
        `该用户第【${count}】次触发关键词，本次将【${
          duration === Infinity
            ? '踢出群聊'
            : '禁言 ' + Time.format(duration * 1000)
        }】`,
      ].join('\n')

      // 打日志
      this.logger.info(log)

      // 禁言或踢出
      sess.bot.deleteMessage(sess.channelId as string, sess.messageId as string)
      if (duration === Infinity) {
        sess.onebot?.setGroupKick(
          sess.channelId as string,
          sess.userId as string,
          false
        )
      } else {
        sess.onebot?.setGroupBan(
          sess.channelId as string,
          sess.userId as string,
          duration
        )
      }

      // 转发
      sess.bot.sendMessage(
        process.env.CHANNEL_QQ_MOEGIRL_ADMIN_LOGS as string,
        `[MGP_UTILS] ${log}`
      )

      // 行车记录仪
      sess.app.database.setUser(sess.platform, sess.userId as string, {
        mgpGroupSpamLogs,
      })
    })

    // 入群监控
    ctx.on('guild-member-request', async (sess) => {
      const data = await sess.app.database.getUser(
        sess.platform,
        sess.userId as string,
        ['mgpGroupSpamLogs']
      )
      const logs = data?.mgpGroupSpamLogs
      if (logs && logs.length) {
        sess.bot.sendMessage(
          process.env.CHANNEL_QQ_MOEGIRL_ADMIN_LOGS as string,
          [
            `[MGP_UTILS] 请注意B群入群申请:`,
            `channel: ${sess.channelId} (${sess.channelName || '未知群名'})`,
            `user: ${sess.userId} (${sess.author?.nickname || '未知昵称'})`,
            `该用户曾【${logs.length}】次触发关键词黑名单。`,
          ].join('\n')
        )
      }
    })
  }

  get logger() {
    return this.ctx.logger('MGP_UTILS')
  }
}
