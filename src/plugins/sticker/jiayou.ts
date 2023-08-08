import { BaseSticker } from './_base'
import { Context, h, Time } from 'koishi'
import {} from '@koishijs/plugin-rate-limit'

export default class 加油 extends BaseSticker {
  constructor(ctx: Context) {
    super(ctx)
    ctx
      .command('sticker.加油 <content:text>', 'Eric_Liu说：“加油！”', {
        minInterval: Time.minute,
      })
      .alias('sticker.jiayou')
      .shortcut(/^表情包 这两周$/, {
        args: ['这两周。'],
        options: {
          avatar: 'https://img.moegirl.org.cn/common/avatars/233835/128.png',
          username: 'User:Etolli',
        },
      })
      .option('username', '-u <name:string>', { hidden: true })
      .option('avatar', '-a <avatar:string>', { hidden: true })
      .action(async ({ session, options }, content) => {
        if (!session || !options) return

        content =
          content?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '加油！'
        try {
          options.avatar = new URL(
            options.avatar || session.author?.avatar || ''
          ).href
        } catch (e) {
          options.avatar = session.author?.avatar
        }
        options.username =
          options.username?.replace(/</g, '&lt;').replace(/>/g, '&gt;') ||
          session?.author?.nickname ||
          session?.author?.username ||
          session?.author?.userId

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
    <img src="${options.avatar}" alt="头像" style="
        width: 2.2em;
        height: 2.2em;
        border-radius: .2em;
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
    ">${options.username}</span>
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

        const img = await ctx.html.html(html, '#sticker')
        return img
      })
  }
}
