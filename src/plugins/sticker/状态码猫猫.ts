import { Context, h } from 'koishi'

import { BaseSticker } from './_base'

export default class 状态码猫猫 extends BaseSticker {
  constructor(public ctx: Context) {
    super(ctx)

    ctx
      .command('sticker.状态码猫猫 <code>', 'HTTP Cats')
      .alias('httpcat')
      .action(async ({ session }, code) => {
        if (!code) code = '404'
        const finalCode = isNaN(+code) ? 404 : Math.abs(parseInt(code))
        return h.image(`https://http.cat/${finalCode}.jpg`)
      })
  }
}
