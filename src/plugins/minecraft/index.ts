import { Context } from 'koishi'

import BasePlugin from '../_boilerplate'
import { MojangApiService } from './MojangApiService'
import { PluginMinecraftSkin } from './skin'

export default class PluginMinecraft extends BasePlugin {
  constructor(
    public ctx: Context,
    options: any
  ) {
    super(ctx, options, 'minecraft')

    ctx.plugin(MojangApiService)
    ctx.plugin(PluginMinecraftSkin)
  }
}
