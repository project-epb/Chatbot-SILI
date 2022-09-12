import { Context, segment } from 'koishi'
import { RenderHTML } from '../utils/RenderHTML'
import BasePlugin from './_bolierplate'

export class PluginHljs extends BasePlugin {
  render: RenderHTML

  constructor(ctx: Context) {
    super(ctx, {}, 'hljs')
    ctx.using(['puppeteer'], (ctx) => {
      this.render = new RenderHTML(ctx)
    })
    ctx
      .command('tools/hljs <code:text>', 'Highlight.js')
      .option('lang', '-l <lang:string> language')
      .option('from', '<from:posint> line from', { fallback: 1 })
      .action(async ({ session, options }, code) => {
        if (!code) return session?.execute('hljs -h')
        const img = await this.render.hljs(code, options?.lang, options?.from)
        return img ? segment.image(img) : '渲染代码时出现了一些问题。'
      })
  }
}
