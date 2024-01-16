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

        const html = `
<div
  id="sticker"
  style="position: relative; display: inline-block;"
>
  <img
    src="https://i.loli.net/2021/07/25/CnBp6z3y8WFAJ4d.jpg"
    style="display: inline-block; width: 250px; height: 250px;"
  />
  <div style="
    position: absolute;
    top: 0;
    left: 0;
    height: 100px;
    width: 100%;
  ">
  <div style="
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
  ">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
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
