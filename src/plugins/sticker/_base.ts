import { Context } from 'koishi'
import BasePlugin from '../_boilerplate'

export class BaseSticker extends BasePlugin {
  static inject = ['html']

  constructor(ctx: Context) {
    super(ctx, {}, 'sticker')
  }
}
