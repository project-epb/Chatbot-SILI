/**
 * @name _internal-MgpGroupUtils
 * @command -
 * @internal true
 * @desc 内部插件，萌娘百科B站粉丝群工具箱
 * @authority -
 */

import { Context } from 'koishi'

export const name = '_internal-MgpGroupUtils'

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

export default class MgpGroupUtils {
  constructor(public ctx: Context) {
    ctx = ctx.channel(process.env.CHANNEL_QQ_MOEGIRL_5 as string)

    // 指令白名单
    ctx.on('command/before-execute', ({ command }) => {
      if (!COMMAND_THITELIST_REG.test(command!.name)) {
        this.logger.info(command!.name, '指令不在白名单，已阻断。')
        return ''
      }
    })

    // 自动禁言
    ctx.on('message', (sess) => {
      if (!KEYWORDS_BLACKLIST_REG.test(sess.content || '')) {
        return
      }
      this.logger.info('触发关键词黑名单', sess.userId, '>', sess.content)
      let duration = 10 * 60
      sess.bot.internal.setGroupBan(sess.channelId, sess.userId, duration)
      sess.bot.deleteMessage(sess.channelId as string, sess.messageId as string)
    })
  }

  get logger() {
    return this.ctx.logger('MGP_UTILS')
  }
}
