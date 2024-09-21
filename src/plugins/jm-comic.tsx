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

  constructor(readonly ctx: Context) {
    super(ctx, {}, '18comic')

    ctx
      .command('jm', '<album:posint> 18comic', { maxUsage: 10 })
      .option('quiet', '-q 静默模式', { hidden: true })
      .action(async ({ session, options }, albumRaw) => {
        const albumNum = this.getAlbumNumFromStrig(albumRaw || '')

        const reply = <quote id={session.messageId} />
        if (!albumNum) {
          return options.quiet ? (
            ''
          ) : (
            <>
              {reply}
              未解析到作品编号
            </>
          )
        }
        const albumInfo = await this.fetchAlbum(albumNum)
        this.logger.info(`JM${albumNum}`, albumInfo)

        const jmLink = <a href={albumInfo.url}>JM{albumNum}</a>
        return (
          <>
            {reply}
            <p>{albumInfo.title || options.quiet ? '' : '可能需要登录：'}</p>
            <p>{jmLink}</p>
          </>
        )
      })

    ctx.middleware(async (session, next) => {
      const albumNum = this.getAlbumNumFromStrig(
        h.select(session.elements, 'text').join('')
      )
      if (!albumNum) {
        return next()
      }

      return session.execute({
        name: 'jm',
        args: [albumNum],
        options: { quiet: true },
      })
    })
  }

  getAlbumNumFromStrig(str: string) {
    const num = str.replace(/\D/g, '')
    if (num.length >= 6 && num.length <= 8) {
      return num
    } else {
      return ''
    }
  }

  async fetchAlbum(album: string) {
    const url = `https://18comic.vip/album/${album}`
    try {
      const html = await fetch(url).then((res) => res.text())
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
    } catch (e) {
      this.logger.warn(`fetchAlbum(${album}) failed:`, e)
      return {
        url,
        title: '',
      }
    }
  }
}
