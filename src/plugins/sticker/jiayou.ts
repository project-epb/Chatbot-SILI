import { BaseSticker } from './_base'
import { Context, segment as s, Time } from 'koishi'

export default class 加油 extends BaseSticker {
  constructor(ctx: Context) {
    super(ctx)
    ctx
      .command('sticker.加油 <content:text>', 'Eric_Liu：“加油！”', {
        minInterval: Time.minute,
      })
      .alias('sticker.jiayou')
      .action(async ({ session }, content) => {
        content =
          content?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '加油！'
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
      <span>${content}</span>
    </span>
  </span>
</span>
`

        const img = await this.render.html(html, '#sticker')
        return img ? s.image(img) : ''
      })
  }
}
