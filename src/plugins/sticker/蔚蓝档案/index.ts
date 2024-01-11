import { Context, h } from 'koishi'

import { resolve } from 'node:path'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'

import { BaseSticker } from '../_base'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default class 蔚蓝档案 extends BaseSticker {
  constructor(public ctx: Context) {
    super(ctx)

    ctx
      .command('sticker.蔚蓝档案 <text:text>', '蔚蓝档案LOGO')
      .alias('sticker.blue-archive', 'sticker.ba')
      .shortcut('BA', { fuzzy: true })
      .shortcut('蔚蓝档案')
      .action(async ({ session }, text) => {
        const [leftText, rightText] = this.splitText(text)
        const image = await this.shot(leftText, rightText)
        return image
      })
  }

  splitText(text: string) {
    // 如果有空格，就按空格切
    if (text.includes(' ')) {
      const [leftText, rightText] = text.split(' ')
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

  async shot(leftText: string, rightText: string) {
    const page = await this.ctx.puppeteer.page()
    try {
      const url = pathToFileURL(resolve(__dirname, 'index.html'))
      url.searchParams.set('leftText', leftText)
      url.searchParams.set('rightText', rightText)
      await page.goto(url.toString(), {
        waitUntil: 'load',
        timeout: 8 * 1000,
      })
      await page.waitForNetworkIdle({ timeout: 5 * 1000 })
      const logo = await page.$('#logo')
      const buffer = await logo?.screenshot({ type: 'jpeg' })
      return h.image(buffer, 'image/jpeg')
    } catch (e) {
      console.error('[BA]', e)
      return `生成失败：${e.message || e}`
    } finally {
      await page.close()
    }
  }
}
