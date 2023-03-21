/**
 * @name PluginSticker
 * @command sticker
 * @desc 生成表情包
 * @authority 1
 */

import BasePlugin from '../_boilerplate'
import { Context } from 'koishi'
import {} from '@koishijs/plugin-puppeteer'
import {} from '@koishijs/plugin-rate-limit'
import 梅因说 from './main-said'
import 加油 from './jiayou'

export default class PluginSticker extends BasePlugin {
  constructor(ctx: Context) {
    super(ctx, {}, 'sticker')
    ctx.command('sticker', '生成表情包！').alias('表情包')
    // List
    ctx.plugin(梅因说)
    ctx.plugin(加油)
  }
}
