import { Context, Fragment, h } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class PluginToImage extends BasePlugin {
  constructor(ctx: Context, options: any) {
    super(ctx, options, 'to-image')

    this.ctx = ctx.platform('onebot', 'red', 'qq')

    ctx
      .command('to-image', '把表情包转换为图片')
      .alias('toimg', '转成图片', '转为图片')
      .action(async ({ session }) => {
        let src = ''
        if (session.quote?.id) {
          src = this.getImgUrlFromMessage(session.quote.elements)
        } else {
          await session.send('请发送表情包')
          const msg = await session.prompt(10 * 1000)
          src = this.getImgUrlFromMessage(msg)
        }
        if (!src) return ''
        return h.image(src)
      })
  }

  getImgUrlFromMessage(payload: Fragment) {
    const elements = h.parse((payload as any)?.join() || payload.toString())
    const [img] = h.select(elements, 'img')
    if (!img) return
    return img.attrs.src || img.attrs.url
  }
}
