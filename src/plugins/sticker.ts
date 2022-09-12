/**
 * @name PluginSticker
 * @command sticker
 * @desc 生成表情包
 * @authority 1
 */

import { Context, Time, segment as s, segment } from 'koishi'
import {} from '@koishijs/plugin-puppeteer'
import {} from '@koishijs/plugin-rate-limit'
import { RenderHTML } from '../utils/RenderHTML'

export default class PluginSticker {
  render: RenderHTML

  constructor(public ctx: Context) {
    ctx.using(['puppeteer'], (ctx) => {
      this.render = new RenderHTML(ctx)
    })
    ctx.command('tools/sticker', '生成表情包')

    ctx
      .command('sticker.original-main-said [content:text]', '沃里杰诺·梅因说', {
        minInterval: Time.minute,
      })
      .alias('sticker.梅因说')
      .action(async ({ session }, content) => {
        if (!session) return

        try {
          const img = await this.render.html(
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
          return img ? s.image(img) : '生成表情包时出现问题。'
        } catch (err) {
          this.logger.error(err)
          return '生成表情包时出现问题。'
        }
      })

    ctx
      .command('sticker.jiayou <text:text>', 'Eric Liu：“加油”', {
        minInterval: Time.minute,
      })
      .alias('sticker.加油')
      .action(async ({ session }, text) => {
        text = text || '加油！'
        const html = `
<span id="sticker" style="
  color: #000;
  font-size: 1em;
  line-height: 1.4;
  background: #F5F6F7;
  border-radius: .4em;
  position: relative;
  display: inline-flex;
  align-items: flex-start;
  padding: .4em .6em .6em;
  vertical-align: middle;
  box-sizing: border-box;
  max-width: 100%;
">
  <span style="
    flex: 0 0 auto;
    border-radius: .2em;
    overflow: hidden;
    margin: .2em 0 0
  ">
    <img src="${session?.author?.avatar}" alt="头像" style="
        width: 2.2em;
        height: 2.2em;
    ">
  </span>
  <span style="
    flex: 1;
    padding-left: .7em;
    overflow: hidden
  ">
    <span style="
      display: block;
      color: #666;
      font-size: .9em;
      margin-left: .3em;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    ">${
      session?.author?.nickname ||
      session?.author?.username ||
      session?.author?.userId
    }</span>
    <span style="
      display: inline-block;
      font-size: 1.3em;
      background: #FFF;
      border-radius: 0 .2em .2em;
      position: relative;
      padding: .4em .6em;
    ">
      <span style="
        display: block;
        position: absolute;
        top: 0;
        left: -.24em;
        border-top: .3em solid #FFF;
        border-left: .25em solid transparent;
      "></span>
      <span>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
    </span>
  </span>
</span>
`

        const img = await this.render.html(html, '#sticker')
        return img ? segment.image(img) : ''
      })
  }

  get logger() {
    return this.ctx.logger('STICKER')
  }
}
