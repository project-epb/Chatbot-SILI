import { Context, h } from 'koishi'

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getDirName } from '@/utils/dir'

import { BaseSticker } from '../_base'

const __dirname = getDirName(import.meta.url)

enum NewsType {
  good_news = 'good_news',
  bad_news = 'bad_news',
}

export default class 喜报悲报 extends BaseSticker {
  constructor(public ctx: Context) {
    super(ctx)

    ctx
      .command('sticker.good-news <text:text>', '喜报')
      .alias('喜报', 'good-news')
      .action(async ({ session }, text) => {
        const image = await this.shot(NewsType.good_news, text)
        return image
      })

    ctx
      .command('sticker.bad-news <text:text>', '悲报')
      .alias('悲报', 'bad-news')
      .action(async ({ session }, text) => {
        const image = await this.shot(NewsType.bad_news, text)
        return image
      })
  }

  async shot(type: NewsType, content: string) {
    const url = pathToFileURL(resolve(__dirname, 'index.html'))
    url.searchParams.set('type', type)
    url.searchParams.set('content', content)

    return this.ctx.html
      .shotByUrl(url, '#sticker')
      .then((buf) => {
        return h.image(buf, 'image/jpeg')
      })
      .catch((e) => {
        this.logger.error('[喜报悲报] shot error:', e)
        return `悲报：${e.message || e}`
      })
  }
}
