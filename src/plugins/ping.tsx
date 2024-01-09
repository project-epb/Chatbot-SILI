/**
 * @name ping-pong
 * @command ping
 * @desc 应答测试
 * @authority 1
 */
import { Context, Time } from 'koishi'

import BasePlugin from '~/_boilerplate'

export default class PluginPing extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'ping')

    ctx
      .command('ping', '应答测试', { minInterval: 10 * Time.second })
      .alias('在吗', '!', '！')
      .action(() => {
        this.logger.info(new Date().toISOString())
        return (
          <random>
            {[
              'pong~',
              '诶，我在~',
              '叫我干嘛呀~',
              'Link start~',
              'Aye Aye Captain~',
              "I'm still alive~",
            ].map((i) => (
              <template>{i}</template>
            ))}
          </random>
        )
      })
  }
}
