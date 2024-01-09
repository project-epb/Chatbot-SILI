/**
 * @name PluginSticker
 * @command sticker
 * @desc 生成表情包
 * @authority 1
 */
import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

import 加油 from './jiayou'
import 梅因说 from './main-said'

export default class PluginSticker extends BasePlugin {
  constructor(ctx: Context) {
    super(ctx, {}, 'sticker')
    ctx.command('sticker', '生成表情包！').alias('表情包')
    // List
    ctx.plugin(梅因说)
    ctx.plugin(加油)
  }
}
