// 这是对于 callme 插件的 hack，禁用检查
// @ts-nocheck

import { Context, Time } from 'koishi'

export const name = 'patch-callme'

export default class PatchCallme {
  constructor(public ctx: Context) {
    ctx
      .command('callme', '', { minInterval: Time.hour, maxUsage: 5 })
      .channelFields(['disable'])
      .userFields(['name'])
      .check(({ session, options }, name) => {
        if (
          session.channel?.disable?.includes('callme') ||
          options.help
        ) {
          return
        }
        if (!name) {
          return session.user.name
            ? `sili认得你，${session.user.name}，你好～`
            : '你还没有给自己取一个名字呢'
        } else if (/(sili)/gi.test(name)) {
          return `拒绝执行：无法接受的昵称。`
        }
      })
  }

  get logger() {
    return this.ctx.logger('PING')
  }
}
