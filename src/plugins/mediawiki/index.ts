/**
 * @name koishi-plugin-mediawiki
 * @desc MediaWiki plugin for Koishijs
 *
 * @author Koishijs(机智的小鱼君) <dragon-fish@qq.com>
 * @license Apache-2.0
 */
import { Context, segment } from 'koishi'
import {} from '@koishijs/plugin-database-mongo'
import {} from '@koishijs/plugin-puppeteer'
import type {
  MWInterwikiLinks,
  MWNamespaceAliases,
  MWNamespaces,
  MWPages,
  MWRedirects,
  MWSpecialPageAliases,
} from './types'
import {
  getUrl,
  getWikiDisplayTitle,
  isValidApi,
  parseTitlesFromText,
  useApi,
} from './utils'
import FormData from 'form-data'
import { INFOBOX_MAP } from './infoboxMap'

// @ts-ignore
globalThis.FormData = FormData

declare module 'koishi' {
  interface Channel {
    mwApi?: string
  }
}

type ConfigInit = {
  /** wikilink 到不存在的页面时是否自动进行搜索 */
  searchNonExist: boolean
  wikiAuthority: number
  linkAuthority: number
  searchAuthority: number
  parseAuthority: number
  parseMinInterval: number
  shotAuthority: number
}
const defaultConfig = {
  searchNonExist: false,
  wikiAuthority: 1,
  connectAuthority: 2,
  searchAuthority: 1,
}
export type Config = Partial<ConfigInit>

export const name = 'mediawiki'

export default class PluginMediawiki {
  INFOBOX_MAP: typeof INFOBOX_MAP

  constructor(public ctx: Context, public config: Config = {}) {
    this.config = { ...defaultConfig, ...config }
    // ctx.using(['database', 'puppeteer'], () => {})
    ctx.model.extend('channel', {
      mwApi: 'string',
    })
    this.init()
    this.INFOBOX_MAP = INFOBOX_MAP
  }

  get logger() {
    return this.ctx.logger('mediawiki')
  }

  init(): void {
    // @command wiki
    this.ctx
      .command('wiki [titles:text]', 'MediaWiki 相关功能', {
        authority: this.config.wikiAuthority,
      })
      .example('wiki 页面 - 获取页面链接')
      .channelFields(['mwApi'])
      .option('details', '-d 显示页面的更多资讯', { type: 'boolean' })
      .option('search', '-s 如果页面不存在就进行搜索', { type: 'boolean' })
      .option('quiet', '-q 静默执行（忽略未绑定提示）', {
        type: 'boolean',
        hidden: true,
      })
      .action(async ({ session, options }, titlesInput = '') => {
        if (!session?.channel) throw new Error('Missing channel context')
        const { mwApi } = session.channel

        // Missing connection init
        if (!mwApi) {
          return options?.quiet ? '' : session.execute('wiki.connect -h')
        }
        // Missing titles
        if (!titlesInput) {
          return getUrl(mwApi)
        }

        // Generate API client
        const api = useApi(mwApi)

        // 去重并缓存用户输入的标题及锚点
        const titles = Array.from(
          new Set(
            titlesInput
              .split('|')
              .map(getWikiDisplayTitle)
              .filter((i) => !!i)
          )
        )
          .map((i) => {
            return {
              name: i.split('#')[0],
              anchor: i.split('#')[1] ? '#' + encodeURI(i.split('#')[1]) : '',
            }
          })
          .reverse()

        const { data } = await api
          .get<{
            query: {
              pages: MWPages
              redirects?: MWRedirects
              interwiki?: MWInterwikiLinks
              specialpagealiases: MWSpecialPageAliases
              namespacealiases: MWNamespaceAliases
              namespaces: MWNamespaces
            }
          }>({
            action: 'query',
            prop: 'extracts|info',
            meta: 'siteinfo',
            siprop: 'specialpagealiases|namespacealiases|namespaces',
            iwurl: 1,
            titles: titles.map((i) => i.name),
            redirects: 1,
            converttitles: 1,
            exchars: '150',
            exlimit: 'max',
            explaintext: 1,
            inprop: 'url|displaytitle',
          })
          .catch((e) => {
            session.send(`查询时遇到问题：${e || '-'}`)
            throw e
          })

        this.logger.debug('PAGES', data.query.pages)

        // Cache variables
        const { pages, redirects, interwiki, specialpagealiases, namespaces } =
          data.query
        /**
         * @desc 某些特殊页面会暴露服务器 IP 地址，必须特殊处理这些页面
         *       已知的危险页面包括 Mypage Mytalk
         */
        // 这里用标准名称
        const dangerPageNames = ['Mypage', 'Mytalk']
        // 获取全部别名
        const dangerPages = specialpagealiases
          .filter((i) => dangerPageNames.includes(i.realname))
          .map((i) => i.aliases)
          .flat(Infinity) as string[]
        // 获取本地特殊名字空间的标准名称
        const specialNsName = namespaces['-1'].name

        const pageMsgs = pages.map((page) => {
          // Cache variables
          const msg: string[] = []
          let pageRedirect = redirects?.find(({ to }) => to === page.title)
          let pageAnchor =
            titles.find(
              (i) =>
                i.name.toLocaleLowerCase() === page.title.toLocaleLowerCase()
            )?.anchor || ''

          // 开始判断危险重定向
          if (
            // 发生重定向
            pageRedirect &&
            // 重定向自特殊页面
            pageRedirect.from.split(':')[0] === specialNsName &&
            // 被标记为危险页面
            dangerPages.includes(
              pageRedirect.from.split(':')?.[1].split('/')[0] || ''
            )
          ) {
            // 覆写页面资料
            page = {
              ...page,
              ns: -1,
              title: pageRedirect.from,
              special: true,
            }
            // 重置重定向信息
            pageRedirect = undefined
            delete page.missing
          }

          const {
            pageid,
            title: pagetitle,
            missing,
            invalid,
            // extract,
            canonicalurl,
            special,
            editurl,
          } = page

          // 打印开头
          msg.push(`您要的“${pagetitle}”：`)
          /** 处理特殊情况 */
          // 重定向
          if (pageRedirect) {
            const { from, to, tofragment } = pageRedirect || {}
            msg.push(
              `重定向：[${from}] → [${to}${tofragment ? '#' + tofragment : ''}]`
            )
            if (tofragment) pageAnchor = '#' + encodeURI(tofragment)
          }
          // 页面名不合法
          if (invalid !== undefined) {
            msg.push(`页面名称不合法：${page.invalidreason || '原因未知'}`)
          }
          // 特殊页面
          else if (special) {
            msg.push(
              `${getUrl(mwApi, {
                title: pagetitle,
              })}${pageAnchor} (${missing ? '不存在的' : ''}特殊页面)`
            )
          }
          // 不存在页面
          else if (missing !== undefined) {
            if (!options?.search) {
              msg.push(`${editurl} (页面不存在)`)
            } else {
              msg.push(`${editurl} (页面不存在，以下是搜索结果)`)
            }
          } else {
            const shortUrl = getUrl(mwApi, { curid: pageid })
            msg.push(
              (shortUrl.length <= canonicalurl.length
                ? shortUrl
                : canonicalurl) + pageAnchor
            )
          }

          return msg.join('\n')
        })

        const interwikiMsgs =
          interwiki?.map((item) => {
            return [`跨语言链接：`, item.url].join('\n')
          }) || []

        const message =
          segment.quote(session.messageId as string) +
          [...pageMsgs, ...interwikiMsgs].join('\n----\n')
        if (
          pages.length === 1 &&
          pages[0].ns === 0 &&
          !pages[0].missing &&
          !pages[0].invalid
        ) {
          await session.send(message)
          session.send(await this.shotInfobox(pages[0].canonicalurl))
        } else {
          return message
        }
      })

    this.ctx.middleware(async (session, next) => {
      await next()
      const titles = parseTitlesFromText(session.content || '')
      if (!titles.length) {
        return
      }
      session.execute(`wiki -q ${titles.join('|')}`)
    })

    // @command wiki.connect
    // @command wiki.link
    this.ctx
      .command('wiki.connect [api:string]', '将群聊与 MediaWiki 网站连接', {
        authority: this.config.linkAuthority,
      })
      .alias('wiki.link')
      .channelFields(['mwApi'])
      .action(async ({ session }, api) => {
        if (!session?.channel) throw new Error()
        const { channel } = session
        if (!api) {
          return channel.mwApi
            ? `本群已与 ${channel.mwApi} 连接。`
            : '本群未连接到 MediaWiki 网站，请使用“wiki.connect <api网址>”进行连接。'
        } else if (isValidApi(api)) {
          channel.mwApi = api
          await session.channel.$update()
          return session.execute('wiki.connect')
        } else {
          return '输入的不是合法 api.php 网址。'
        }
      })

    // @command wiki.search
    this.ctx
      .command('wiki.search [srsearch:text]')
      .channelFields(['mwApi'])
      .action(async ({ session }, srsearch) => {
        if (!session?.channel?.mwApi) {
          return session?.execute('wiki.connect -h')
        }
        if (!srsearch) {
          session.sendQueued('要搜索什么呢？(输入空行或句号取消)')
          srsearch = (await session.prompt(30 * 1000)).trim()
          if (!srsearch || srsearch === '.' || srsearch === '。') return ''
        }
        const api = useApi(session.channel.mwApi)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {
          data: {
            query: {
              searchinfo: { totalhits },
              search,
            },
          },
        } = await api.post<{
          query: {
            searchinfo: {
              totalhits: number
            }
            search: {
              ns: number
              title: string
              pageid: number
              size: number
              wordcount: number
              snippet: string
              timestamp: string
            }[]
          }
        }>({
          action: 'query',
          list: 'search',
          srsearch,
          srlimit: 3,
          redirects: 'true',
        })

        const msg: string[] = []

        if (search.length < 1) {
          return `关键词“${srsearch}”没有匹配结果。`
        } else if (search.length === 1) {
          return session.execute(`wiki ${search[0].title}`)
        } else {
          msg.push(
            `🔍关键词“${srsearch}”共匹配到 ${totalhits} 个相关结果，展示前 ${search.length} 个：`
          )
        }
        search.forEach((item, index: number) => {
          msg.push(
            `${index + 1} ${item.title}${
              item.snippet
                ? '\n    ' +
                  item.snippet
                    .trim()
                    .replace(/<.+?>/g, '')
                    .replace(/\n/g, '\n    ')
                : ''
            }`
          )
        })
        msg.push('✍️请输入想查看的页面编号')

        await session.sendQueued(msg.join('\n'))

        const choose = parseInt(await session.prompt(30 * 1000))
        if (!isNaN(choose) && search[choose - 1]) {
          session.execute('wiki --details ' + search[choose - 1].title)
        }
      })
  }

  async shotInfobox(url: string) {
    const matched = this.INFOBOX_MAP.find((i) => i.match(new URL(url)))
    if (!matched) return ''
    this.logger.info('SHOT_INFOBOX', url, matched.cssClasses)

    let pageLoaded = false
    const page = await this.ctx.puppeteer.page()
    page.on('load', () => (pageLoaded = true))

    try {
      await page.goto(url, {
        timeout: 30 * 1000,
        waitUntil: 'networkidle0',
      })
    } catch (e) {
      this.logger.warn('SHOT_INFOBOX', 'Navigation timeout', pageLoaded, e)
      if (!pageLoaded) {
        await page.close()
        return ''
      }
    }

    try {
      const target = await page.$(matched.cssClasses)
      if (!target) {
        this.logger.info('SHOT_INFOBOX', 'Canceled', 'Missing target')
        await page.close()
        return ''
      }
      const img = await target.screenshot({ type: 'jpeg', quality: 85 })
      this.logger.info('SHOT_INFOBOX', 'OK', img)
      await page.close()
      return segment.image(img)
    } catch (e) {
      this.logger.warn('SHOT_INFOBOX', 'Failed', e)
      await page?.close()
      return ''
    }
  }
}
