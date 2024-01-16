import { Context } from 'koishi'

import BasePlugin from '~/_boilerplate'

import MintFilterService from './MintFilterService'
import SensitiveFilterMain from './main'

export default class PluginSensitiveFilter extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'sensitive-filter')
    ctx.plugin(MintFilterService)
    ctx.plugin(SensitiveFilterMain)
  }
}
