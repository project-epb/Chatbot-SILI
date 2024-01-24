import { Context, h } from 'koishi'

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
        if (session.quote) {
          src = this.getImgUrlFromMessage(session.quote.content)
        } else {
          await session.send('请发送表情包')
          const msg = await session.prompt(10 * 1000)
          src = this.getImgUrlFromMessage(msg)
        }
        if (!src) return ''
        this.logger.info('src', `<${src}>`)
        return h.image(src)
      })
  }

  getImgUrlFromMessage(msg: string) {
    if (!msg) return
    const elements = h.parse(msg)
    const [img] = h.select(elements, 'img')
    if (!img) return
    return (img.attrs.src || img.attrs.url || '').trim()
  }
}
