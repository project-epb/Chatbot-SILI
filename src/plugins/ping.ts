import { Context } from 'koishi'

export const name = 'ping-pong'

export default class PluginPing {
  ctx: Context

  constructor(ctx: Context) {
    this.ctx = ctx

    ctx
      .command('ping', '应答测试')
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
