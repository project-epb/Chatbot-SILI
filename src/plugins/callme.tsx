/**
 * @name patch-callme
 * @command callme
 * @desc 对 callme 插件的 hack
 * @authority -
 */

import { Context, segment, Time } from 'koishi'
import {} from '@koishijs/plugin-rate-limit'

declare module 'koishi' {
  export interface Channel {
    disable: string[]
  }
  export interface User {
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
          const escapedName = segment.escape(session!.user.name)
          return session!.user?.name ? (
            <random>
              <template>SILI认得你，{escapedName}，你好~</template>
              <template>啊，这不是{escapedName}吗~</template>
            </random>
          ) : (
            <random>
              <template>SILI还不认得你哟~</template>
              <template>你还没告诉SILI你叫什么呢~</template>
              <template>你还没有向SILI自我介绍过哟~</template>
            </random>
          )
        }
      })
      .check((_, name) => {
        if (!name) return
        const invalid = /[<>]/.test(name)
        if (invalid) {
          return (
            <>
              果咩，
              <random>
                <template>这个名字SILI不会念！</template>
                <template>这个名字太奇怪了！</template>
                <template>这个名字实在是太为难SILI了！</template>
              </random>
            </>
          )
        }
      })
      .check((_, name) => {
        if (!name) return
        const verify = ctx.mint.verify(name)
        if (/(sili)/gi.test(name) || !verify) {
          return (
            <>
              哒咩，
              <random>
                <template>SILI不喜欢这个名字！</template>
                <template>这样是不对的，请不要拿SILI开玩笑！</template>
                <template>SILI觉得这个名字很冒犯！</template>
              </random>
            </>
          )
        }
      })
  }

  get logger() {
    return this.ctx.logger('PING')
  }
}
