import { Context, h } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class PluginHljs extends BasePlugin {
  static inject = ['html']

  constructor(ctx: Context) {
    super(ctx, {}, 'hljs')
    ctx
      .command('tools/hljs <code:text>', 'Highlight.js')
      .option('lang', '-l <lang:string> language')
      .option('from', '-f <from:posint> line from', { fallback: 1 })
      .action(async ({ session, options }, code) => {
        if (!code) return session?.execute('hljs -h')
        const img = await ctx.html.hljs(code, options?.lang, options?.from)
        return img ? h.img(img, 'image/jpg') : '渲染代码时出现了一些问题。'
      })
  }
}
