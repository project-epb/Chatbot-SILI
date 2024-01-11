import { Context } from 'koishi'

import { BaseSticker } from './_base'

export default class PornHub extends BaseSticker {
  constructor(public ctx: Context) {
    super(ctx)

    ctx
      .command('sticker.pornhub <text:text>', 'PornHub')
      .alias('sticker.ph')
      .shortcut('PH', { fuzzy: true })
      .shortcut('PornHub')
      .action(async ({ session }, text) => {
        if (!text) {
          text = 'Porn Hub'
        }
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

  dropXSS(text: string) {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  async shot(leftText: string, rightText: string) {
    leftText = this.dropXSS(leftText)
    rightText = this.dropXSS(rightText)
    const html = `
<logo style="
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background: #000;
  border-radius: 0.2em;
  font-size: 60px;
  padding: 0.3em;
  line-height: 1;
">
  <div style="
    color: #fff;
    padding: 0.2em;
  ">${leftText}</div>
  <div style="
    background: #ff9900;
    padding: 0.2em;
    border-radius: 0.1em;
    margin-left: 0.2em;
  ">${rightText}</div>
</logo>
`

    const image = await this.ctx.html.html(html, 'logo', {
      type: 'png',
      omitBackground: true,
    })

    return image
  }
}
