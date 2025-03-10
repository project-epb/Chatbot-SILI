import { Context } from 'koishi'

import BasePlugin from './_boilerplate'

export default class PluginCanIUse extends BasePlugin {
  static readonly inject = ['html']

  constructor(ctx: Context) {
    super(ctx, {}, 'caniuse')

    ctx
      .command('tools/caniuse <keywords...>', '查询 CSS/JS 特性的兼容性', {
        minInterval: 10 * 1000,
        bypassAuthority: 2,
      })
      .check(({ command }, keywords) => {
        if (!keywords?.trim()) {
          return <execute>help {command.name}</execute>
        }
      })
      .action(async ({ session }, keywords) => {
        const url = this.makeLink(keywords)
        try {
          const buf = await ctx.html.shotByUrl(
            url,
            '.ciu-page-content, ciu-feature-list'
          )
          return (
            <>
              <quote id={session.messageId} />
              <img src={`data:image/jpeg;base64,${buf.toString('base64')}`} />
              前往查看：{url}
            </>
          )
        } catch (e) {
          return (
            <>
              <quote id={session.messageId} />
              <p>查询失败：{e.message}</p>
              <p>{url}</p>
            </>
          )
        }
      })
  }

  makeLink(keywords: string) {
    const url = new URL('https://caniuse.com/')
    url.searchParams.set('search', keywords)
    return url.href
  }
}
