/**
 * @name patch-callme
 * @command callme
 * @desc 对 callme 插件的 hack
 * @authority -
 */

import { Context, segment, Time } from 'koishi'
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
  static using = ['mint']

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
            ? `sili认得你，${segment.escape(session!.user.name)}，你好～`
            : '你还没有给自己取一个名字呢'
        }
      })
      .check((_, name) => {
        if (!name) return
        if (/[<>]/.test(name)) {
          return `警告：非法昵称。`
        }
      })
      .check((_, name) => {
        if (!name) return
        if (/(sili)/gi.test(name) || !ctx.mint.verify(name)) {
          return `警告：无法接受的昵称。`
        }
      })
  }

  get logger() {
    return this.ctx.logger('PING')
  }
}
