import { Context } from 'koishi'

import BasePlugin from '@/plugins/_boilerplate'

export class GuildRequestFirewall extends BasePlugin {
  static readonly ANSWER_BLACK_LIST = ['管理员你好，我是来交流学习的']

  constructor(ctx: Context) {
    super(ctx, null, 'guild-request-firewall')

    ctx.guild().on('guild-member-request', async (session) => {
      const answer = session.content.split('答案：').pop().trim()
      if (GuildRequestFirewall.ANSWER_BLACK_LIST.includes(answer)) {
        await session.bot.handleGuildMemberRequest(session.messageId, false, '')
        session.sendQueued('提示：SILI 拒绝了一条烦人的入群申请。')
      }
    })
  }
}
