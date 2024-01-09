import { Context, Time, h } from 'koishi'

import { BaseSticker } from './_base'

export default class 梅因说 extends BaseSticker {
  constructor(ctx: Context) {
    super(ctx)
    ctx
      .command('sticker.梅因说 [content:text]', '沃里杰诺·梅因说', {
        minInterval: Time.minute,
      })
      .alias('sticker.main-said', 'sticker.original-main-said')
      .action(async ({ session }, content) => {
        if (!session) return

        try {
          const img = await ctx.html.html(
            `
<div
  style="position: relative; display: inline-block;"
  id="sticker"
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
</div>
                  `,
            '#sticker'
          )
          return img || '生成表情包时出现问题。'
        } catch (err) {
          this.logger.error(err)
          return '生成表情包时出现问题。'
        }
      })
  }
}
