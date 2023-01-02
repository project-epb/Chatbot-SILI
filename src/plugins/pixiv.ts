/**
 * @name pixiv
 * @command pixiv
 * @desc pixiv插画查看工具
 * @authority 1
 */

import { Context, segment, Time } from 'koishi'
import axios from 'axios'
import { BulkMessageBuilder } from '../utils/BulkMessageBuilder'

const API_BASE = process.env.API_PIXIVNOW_API

export default class PluginPixiv {
  constructor(public ctx: Context) {
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

        let data
        try {
          data = (await axios.get(`${API_BASE}/api/illust/${id}`)).data
        } catch (error) {
          this.logger.warn(error)
          return [
            segment.quote(session.messageId as string),
            error?.response?.data?.message || error.message || '出现未知问题',
          ].join('')
        }

        let imageUrl = '',
          allPics,
          picNums,
          page = options!.page as number

        allPics = data.pages
        picNums = allPics.length
        page = Math.min(picNums, page)
        imageUrl = options!.original
          ? allPics[page - 1].urls.original
          : allPics[page - 1].urls.regular

        const desc = data.description
          .replace(/<br.*?\/>/g, '\n')
          .replace(/<\/?.+>/g, '')
        const allTags = data.tags.tags.map((i: any) => `#${i.tag}#`)

        const builder = new BulkMessageBuilder(session)
        builder.prependOriginal()
        const lines = [
          segment.image(`${API_BASE}${imageUrl}`),
          picNums ? `第 ${page} 张，共 ${picNums} 张` : null,
          `标题：${data.title}`,
          `作者：${data.userName} (${data.userId})`,
          desc.length > 300 ? desc.substring(0, 300) + '...' : desc,
          `标签：${allTags.length > 0 ? allTags.join(' ') : '无'}`,
          `${API_BASE}/i/${data.id}`,
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
          data = (await axios.get(`${API_BASE}/api/user/${id}`)).data
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
