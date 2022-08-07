/**
 * @name version
 * @command version
 * @desc 这是一个插件
 * @authority 1
 */

import { Context, Session } from 'koishi'

export const name = 'version'

export default class PluginVersion {
  constructor(public ctx: Context) {
    ctx.command('version', '查看SILI版本信息').action(async ({ session }) => {
      const SILI_CORE = (await import('../../package.json')).default
      const ONEBOT = await ctx.bots
        .find((i) => i.platform === 'onebot')
        ?.internal.getVersionInfo()
      return `SILI_CORE: ${SILI_CORE.version}\nONEBOT: ${ONEBOT.version}\nPowered by Koishi.js v4`
    })
  }

  get logger() {
    return this.ctx.logger('VERSION')
  }
}
