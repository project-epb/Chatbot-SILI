/**
 * @name PluginProfile
 * @command profile
 * @desc 基本资料
 * @authority 1
 */

import { Context, segment } from 'koishi'
import { BulkMessageBuilder } from '../utils/BulkMessageBuilder'

export default class PluginProfile {
  constructor(public ctx: Context) {
    ctx
      .command('admin/profile', '基本资料', {})
      // @ts-ignore
      .userFields(['id', 'authority', 'name', 'github.accessToken'])
      .action(async ({ session }) => {
        if (!session) return
        const nickname = session.user?.name
          ? segment.escape(session.user?.name)
          : ''
        const bindings = await session.app.database.get('binding', {
          aid: session.user.id,
        })
        const isBoundText = (i: boolean) => (i ? '√ 已绑定' : '× 未绑定')
        const isPlatformBoundText = (platform: string) => {
          return isBoundText(!!bindings.find((i) => i.platform === platform))
        }
        const msgBuilder = new BulkMessageBuilder(session)
        msgBuilder
          .prependOriginal()
          .botSay(
            `个人资料\n平台ID: ${session.userId}\n平台昵称/群名片: ${
              session.author?.nickname || ''
            }`
          )
          .botSay(`UID: ${session.user?.id}`)
          .botSay(`SILI称你为: ${nickname}`)
          .botSay(`权限: ${session.user?.authority || 0}`)
          .botSay(
            [
              `账号绑定情况:`,
              `${isPlatformBoundText('onebot')} QQ`,
              `${isPlatformBoundText('qqguild')} QQ频道`,
              `${isPlatformBoundText('discord')} Discord`,
              `${isPlatformBoundText('kooka')} Kook`,
              `${isPlatformBoundText('villa')} 大别野`,
              `${isPlatformBoundText('dingtalk')} 钉钉`,
              // @ts-ignore
              `${isBoundText(!!session.user?.github?.accessToken)} GitHub`,
            ].join('\n')
          )
        return msgBuilder.all()
      })
  }

  get logger() {
    return this.ctx.logger('PLUGIN')
  }
}
