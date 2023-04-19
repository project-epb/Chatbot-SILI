/**
 * @name pixiv
 * @command pixiv
 * @desc pixiv插画查看工具
 * @authority 1
 */

import { Context, segment, Time } from 'koishi'
import axios from 'axios'
import { BulkMessageBuilder } from '../utils/BulkMessageBuilder'

const API_BASE = process.env.API_PIXIV_BASE

export default class PluginPixiv {
  constructor(public ctx: Context) {
    const ajax = axios.create({
      baseURL: API_BASE,
      headers: {
        referer: 'https://www.pixiv.net',
      },
    })

    ctx
      .command('pixiv [id:posint]', 'pixiv.net 相关功能')
      .action(({ session }, id) => {
        if (!session) return
        if (id) return session.execute(`pixiv.illust ${id}`)
        return session.execute('pixiv -h')
      })

    ctx
      .command('pixiv.illust <id:posint>', '查看 Pixiv 插画', {
        minInterval: 10 * Time.second,
      })
      .alias('pixiv插画', 'p站插画', 'pixiv.i', 'pixiv.artwork')
      .option('page', '-p <p:posint> 从多张插画中进行选择', { fallback: 1 })
      .option('original', '-o 显示原画 (可能会慢很多)', { fallback: false })
      .action(async ({ session, options }, id) => {
        if (!session) return
        if (!id) return session.execute('pixiv.illust -h')

        this.logger.info({ id, options })

        let info, pages
        try {
          ;[{ data: info }, { data: pages }] = await Promise.all([
            axios.get(`${API_BASE}/ajax/illust/${id}?full=1`),
            axios.get(`${API_BASE}/ajax/illust/${id}/pages`),
          ])
        } catch (error) {
          this.logger.warn(error)
          return [
            segment.quote(session.messageId as string),
            error?.response?.data?.message || error.message || '出现未知问题',
          ].join('')
        }

        const totalImages = pages.length
        const selectedPage = Math.min(totalImages, options!.page as number)
        const imageUrl = options!.original
          ? pages[selectedPage - 1].urls.original
          : pages[selectedPage - 1].urls.regular

        const desc = info.description
          .replace(/<br.*?>/g, '\n')
          .replace(/<\/?.+?>/g, '')
        const allTags = info.tags.tags.map((i: any) => `#${i.tag}`)

        const builder = new BulkMessageBuilder(session)
        builder.prependOriginal()
        const lines = [
          segment.image(`${API_BASE}${imageUrl}`),
          totalImages ? `第 ${selectedPage} 张，共 ${totalImages} 张` : null,
          `${info.title}`,
          desc.length > 500 ? desc.substring(0, 500) + '...' : desc,
          `作者: ${info.userName} (ID: ${info.userId})`,
          `👍${info.likeCount} ❤️${info.bookmarkCount} 👀${info.viewCount}`,
          `发布时间: ${new Date(info.createDate).toLocaleString()}`,
          allTags.length ? allTags.join(' ') : null,
          `${API_BASE}/i/${info.id}`,
        ].map((i) =>
          typeof i === 'string' ? i.trim().replace(/\n+/g, '\n') : i
        )
        lines.forEach((i) => builder.botSay(i))

        return builder.all()
      })

    ctx
      .command('pixiv.user <id:posint>')
      .alias('pixiv用户', 'p站用户', 'pixiv.u')
      .action(async ({ session }, id) => {
        if (!session) return
        if (!id) return session.execute('pixiv.user -h')

        let data
        try {
          data = (await axios.get(`${API_BASE}/ajax/user/${id}?full=1`)).data
        } catch (error) {
          this.logger.warn(error)
          return [
            segment.quote(session.messageId as string),
            error.message || '出现未知问题',
          ].join('')
        }

        const { imageBig, userId, name, comment } = data

        const builder = new BulkMessageBuilder(session)
        builder.prependOriginal()
        const lines = [
          segment.image(`${API_BASE}${imageBig}`),
          `${name} (${userId})`,
          comment,
        ].map((i) =>
          typeof i === 'string' ? i.trim().replace(/\n+/g, '\n') : i
        )
        lines.forEach((i) => builder.botSay(i))

        return builder.all()
      })

    // 快捷方式
    ctx.middleware(async (session, next) => {
      await next()
      const reg =
        /(?:(?:https?:)?\/\/)?(?:www\.pixiv\.net|pixiv\.js\.org)\/(?:en\/)?(?:artworks|i)\/(\d+)/i
      const pixivId = reg.exec(session.content as string)
      if (pixivId && pixivId[1]) {
        session.execute(`pixiv.illust ${pixivId[1]}`)
      }
    })
  }

  get logger() {
    return this.ctx.logger('PIXIV')
  }
}
