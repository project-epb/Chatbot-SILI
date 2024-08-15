import { Context, Time, h } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class PluginWebShot extends BasePlugin {
  static inject = ['puppeteer']

  constructor(ctx: Context) {
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

    try {
      const img = await this.ctx.html.shotByUrl(url, options.selector, {
        timeout: options.timeout || 30 * Time.second,
      })

      return img ? h.image(img, 'image/jpeg') : '无法截取网页'
    } catch (e) {
      return h.text(`网页截图时遇到问题: ${e.message || e}`)
    }
  }
}
