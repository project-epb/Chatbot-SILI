/**
 * @name _internal-MgpGroupUtils
 * @command -
 * @internal true
 * @desc 内部插件，萌娘百科B站粉丝群工具箱
 * @authority -
 */

import { Context } from 'koishi'

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
    ctx = ctx.channel(
      process.env.CHANNEL_QQ_MOEGIRL_BFANS_1 as string,
      process.env.CHANNEL_QQ_MOEGIRL_BFANS_2 as string
    )

    // 指令白名单
    ctx.on('command/before-execute', ({ command }) => {
      if (!COMMAND_THITELIST_REG.test(command!.name)) {
        this.logger.info(command!.name, '指令不在白名单，已阻断。')
        return ''
      }
    })

    // 自动禁言
    ctx.on('message', (sess) => {
      const match = KEYWORDS_BLACKLIST_REG.exec(sess.content || '')
      if (!match) {
        return
      }
      const log = `B群触发关键词黑名单: ${match[1]}\n${sess.username} (${sess.userId}) > ${sess.content}`
      this.logger.info(log)
      let duration = 10 * 60
      sess.bot.internal.setGroupBan(sess.channelId, sess.userId, duration)
      sess.bot.deleteMessage(sess.channelId as string, sess.messageId as string)
      // 转发
      sess.bot.sendMessage(
        process.env.CHANNEL_QQ_MOEGIRL_ADMIN_LOGS as string,
        `[MGP_UTILS] ${log}`
      )
    })
  }

  get logger() {
    return this.ctx.logger('MGP_UTILS')
  }
}
