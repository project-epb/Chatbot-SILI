/**
 * @name FallbackHandler
 * @desc 内部插件，用于处理未匹配到任何指令的消息
 */
import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class FallbackHandler extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'FallbackMessage')

    ctx.middleware(async (session, next) => {
      const res = await next()
      if (!res) {
        if (session.stripped.atSelf || session.stripped.appel) {
          console.info('matched bot but no command applied:', res, session.content)
        }
      }
    })
  }
}
