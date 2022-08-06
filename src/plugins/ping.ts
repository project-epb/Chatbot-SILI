/**
 * @name ping-pong
 * @command ping
 * @desc 应答测试
 * @authority 1
 */

import { Context, Time } from 'koishi'

export const name = 'ping-pong'

export default class PluginPing {
  constructor(public ctx: Context) {
    ctx
      .command('ping', '应答测试', { minInterval: 10 * Time.second } as any)
      .alias('在吗', '!', '！')
      .action(() => {
        this.logger.info(new Date().toISOString())
        return this.random([
          'pong~',
          '诶，我在~',
          '叫我干嘛呀~',
          'Link start~',
          'Aye Aye Captain~',
          "I'm still alive~",
        ])
      })
  }

  random(arr: string[] = []) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[Math.floor(Math.random() * arr.length)]
    } else {
      return ''
    }
  }

  get logger() {
    return this.ctx.logger('PING')
  }
}
