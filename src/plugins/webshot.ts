import { Context, Time, h } from 'koishi'
import BasePlugin from './_boilerplate'

export default class PluginWebShot extends BasePlugin {
  static inject = ['puppeteer']

  constructor(public ctx: Context) {
    super(ctx, null, 'webshot')

    ctx
      .command('screenshot <url>', '截图', { authority: 2 })
      .alias('shot', '截图')
      .option('full', '-f 截取整个页面', { type: 'boolean' })
      .option('timeout', '-t <timeout> 超时时间', {
        fallback: 30 * Time.second,
      })
      .option('selector', '-s <selector> CSS选择器')
      .action(async ({ options }, url) => {
        return this.shot(url, options)
      })
  }

  async shot(
    url: string,
    options: {
      full?: boolean
      timeout?: number
      selector?: string
    }
  ) {
    try {
      const urlURL = new URL(url)
      if (!urlURL.protocol.startsWith('http')) {
        throw new URL('非法的 URL')
      }
    } catch (e) {
      throw new URL('无效的 URL')
    }

    if (options.full) {
      options.selector = 'body'
    }

    let pageLoaded = false
    const page = await this.ctx.puppeteer.page()
    await page.setViewport({ width: 1920, height: 1080 })

    try {
      // 开始竞速，load 事件触发后最多再等 5s
      await Promise.race([
        page.goto(url, {
          timeout: options.timeout || 30 * Time.second,
          waitUntil: 'networkidle0',
        }),
        new Promise((resolve) => {
          page.on('load', () => {
            pageLoaded = true
            setTimeout(() => resolve(1), 5 * 1000)
          })
        }),
      ]).catch((e) => {
        // do nothing
      })

      if (!pageLoaded) {
        throw new Error('页面加载超时')
      }

      const $el = options.selector ? await page.$(options.selector) : page
      const image = await $el.screenshot({
        type: 'jpeg',
        quality: 90,
      })

      return h.image(image, 'image/jpeg')
    } catch (e) {
      return h.text(`网页截图时遇到问题: ${e.message || e}`)
    } finally {
      page.close()
    }
  }
}
