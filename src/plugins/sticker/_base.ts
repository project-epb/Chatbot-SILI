import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export class BaseSticker extends BasePlugin {
  static inject = ['html', 'puppeteer']

  constructor(ctx: Context) {
    super(ctx, {}, 'sticker')
  }

  cutTextInHalf(text: string) {
    text = text.trim()

    // 如果有空格，就按空格切
    if (text.includes(' ')) {
      const parts = text.split(' ')
      const middleIndex = Math.floor(parts.length / 2)
      const leftText = parts.slice(0, middleIndex).join(' ')
      const rightText = parts.slice(middleIndex).join(' ')
      return [leftText, rightText]
    }

    // 查询大写字母是否为两个，例如 BlueArchive 就切成 Blue Archive
    const ucLetters = text.match(/[A-Z]/g)
    if (ucLetters?.length === 2) {
      const [leftText, rightText] = text.split(ucLetters[1])
      return [leftText, ucLetters[1] + rightText]
    }

    // 如果都不是，就对半切，如果是单数，中间的归右边
    const middleIndex = Math.floor(text.length / 2)
    const leftText = text.slice(0, middleIndex)
    const rightText = text.slice(middleIndex)
    return [leftText, rightText]
  }

  async shotByURL(
    fileUrl: string | URL,
    targetSelector: string,
    options?: Partial<{
      type: 'jpeg' | 'png'
      omitBackground: boolean
      timeout: number
    }>
  ) {
    options = {
      ...options,
      type: 'jpeg',
      timeout: 15 * 1000,
    }
    const page = await this.ctx.puppeteer.page()
    try {
      await page.goto(fileUrl.toString(), {
        waitUntil: 'load',
        timeout: options.timeout,
      })

      const target = await page.$(targetSelector)
      if (!target) {
        throw new Error(`Missing target element: ${targetSelector}`)
      }

      return target?.screenshot({ type: 'jpeg' })
    } catch (e) {
      this.logger.warn('[SHOT] load error:', e)
      const target = await page.$(targetSelector).catch(() => null)
      if (target) {
        this.logger.warn('[SHOT] target found, take it anyway:', targetSelector)
        return target?.screenshot({ type: 'jpeg' })
      }
      throw e
    } finally {
      await page.close()
    }
  }
}
