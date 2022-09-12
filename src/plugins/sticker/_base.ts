import { Context } from 'koishi'
import { RenderHTML } from '../../utils/RenderHTML'
import BasePlugin from '../_bolierplate'

export class BaseSticker extends BasePlugin {
  render: RenderHTML

  constructor(ctx: Context) {
    super(ctx, {}, 'sticker')
    ctx.using(['puppeteer'], (ctx) => {
      this.render = new RenderHTML(ctx)
    })
  }
}
