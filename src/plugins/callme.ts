/**
 * @name patch-callme
 * @command callme
 * @desc 对 callme 插件的 hack
 * @authority -
 */

import { Context, Time } from 'koishi'
import {} from '@koishijs/plugin-rate-limit'

declare module 'koishi' {
  interface Channel {
    disable: string[]
  }
  interface User {
    name: string
  }
}

export default class PatchCallme {
  constructor(public ctx: Context) {
    ctx
      .command('callme', '', { minInterval: Time.hour, maxUsage: 5 })
      .channelFields(['disable'])
      .userFields(['name'])
      .check(({ session, options }, name) => {
        if (
          session!.channel?.disable?.includes('callme') ||
          (options as any).help
        ) {
          return
        }
        if (!name) {
          return session!.user?.name
            ? `sili认得你，${session!.user.name}，你好～`
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
