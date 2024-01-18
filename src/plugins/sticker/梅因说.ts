import { Context, Time, h } from 'koishi'

import { BaseSticker } from './_base'

export default class 梅因说 extends BaseSticker {
  constructor(ctx: Context) {
    super(ctx)
    ctx
      .command('sticker.梅因说 [content:text]', '沃里杰诺·梅因说', {
        minInterval: Time.minute,
      })
      .alias('sticker.main-said', '梅因说')
      .action(async ({ session }, content) => {
        if (!session) return

        content = this.ctx.html.preformattedText(content) || '······'

        const html = `
<div id="sticker" style="position: relative;width: 500px;height: 500px;">
  <img src="https://i.loli.net/2021/07/25/CnBp6z3y8WFAJ4d.jpg" style="width: 100%;height: 100%;object-fit: cover;">
  <div style="
    position: absolute;
    top: 20px;
    left: 49%;
    height: 120px;
    width: 240px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  ">
  <div style="
    max-width: 100%;
    max-height: 100%;
    text-align: center;
    text-overflow: ellipsis;
    overflow: hidden;
">${content}</div>
  </div>
</div>`

        return this.ctx.html
          .html(html, '#sticker')
          .then((buf) => {
            return h.image(buf, 'image/jpeg')
          })
          .catch((e) => {
            return `梅因嗦不粗发：${e.message || e}`
          })
      })
  }
}
