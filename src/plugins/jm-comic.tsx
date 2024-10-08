import { Context, h } from 'koishi'

import BasePlugin from '~/_boilerplate'

import { load } from 'cheerio'

export default class PluginJMComic extends BasePlugin {
  readonly JM_SOURCE = [
    'https://18comic.vip',
    'https://18comic.org',
    'https://jmcomic1.me',
    'https://18comic-palworld.vip',
    'https://18comic-c.art',
  ]
  static readonly inject = ['http', 'puppeteer']

  constructor(readonly ctx: Context) {
    super(ctx, {}, '18comic')

    ctx
      .command('jm.decode', '<album:posint> 18comic')
      .option('quiet', '-q 静默模式', { hidden: true })
      .action(async ({ session, options }, albumRaw) => {
        const albumNum = this.getAlbumNumFromStrig(albumRaw || '')

        const reply = <quote id={session.messageId} />
        if (albumNum === 0) {
          return options.quiet ? (
            ''
          ) : (
            <>
              {reply}
              未解析到 JM 编号
            </>
          )
        }
        const url = `${this.JM_SOURCE[0]}/album/${albumNum}`
        return (
          <>
            {reply}
            {url}
          </>
        )
      })

    ctx.middleware(async (session, next) => {
      await next()

      const plainText = h.select(session.elements, 'text').join('')
      if (!/^jm/i.test(plainText)) {
        return
      }
      const albumNum = this.getAlbumNumFromStrig(plainText)
      if (albumNum === 0) {
        return
      }

      return session.execute({
        name: 'jm.decode',
        args: [albumNum],
        options: { quiet: true },
      })
    })
  }

  getAlbumNumFromStrig(str: string): number {
    str = '' + str // make sure it's a string
    const num = str.replace(/\D/g, '')
    if (num.startsWith('0')) {
      return 0
    } else if (num.length === 6) {
      return parseInt(num)
    } else {
      return 0
    }
  }

  async fetchAlbum(album: string) {
    const url = `https://18comic.vip/album/${album}`
    const page = await this.ctx.puppeteer.page()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      const html = await page.content()
      const $ = load(html)
      const title = $('h1#book-name, title')
        .text()
        .replace('Comics - 禁漫天堂', '')
        .trim()
      // 404
      if (title === '禁漫天堂') {
        throw new Error('404')
      }
      return {
        title,
        url,
      }
    } catch (e: any) {
      this.logger.warn(
        `fetchAlbum(${album}) failed:`,
        e?.message,
        e?.response?.data,
        e
      )
      return {
        url,
        title: '',
      }
    } finally {
      await page.close()
    }
  }
}
