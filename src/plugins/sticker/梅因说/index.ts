import { Context, Time, h } from 'koishi'

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { BaseSticker } from '../_base'

export default class 梅因说 extends BaseSticker {
  constructor(ctx: Context) {
    super(ctx)
    ctx
      .command('sticker.梅因说 [content:text]', '沃里杰诺·梅因说', {
        minInterval: Time.minute,
      })
      .alias('sticker.main-said', '梅因说')
      .action(async ({ session }, content) => {
        if (!session) return

        content = (content || '……').slice(0, 233)
        const url = pathToFileURL(resolve(__dirname, 'index.html'))
        url.searchParams.set('content', content)

        return this.ctx.html
          .shotByUrl(url, '#memeCanvas')
          .then((buf) => {
            return h.image(buf, 'image/jpeg')
          })
          .catch((e) => {
            return `梅因嗦不粗发：${e.message || e}`
          })
      })
  }
}
