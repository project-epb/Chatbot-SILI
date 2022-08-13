/**
 * @name version
 * @command version
 * @desc 这是一个插件
 * @authority 1
 */

import { Context, version as KOISHI_VERSION } from 'koishi'
import { execSync } from 'child_process'

export default class PluginVersion {
  constructor(public ctx: Context) {
    ctx.command('version', '查看SILI版本信息').action(async () => {
      const GIT_HASH = execSync('git rev-parse --short HEAD').toString().trim()
      const SILI_CORE = (
        await import('../../package.json', { assert: { type: 'json' } })
      ).default
      const ONEBOT = await ctx.bots
        .find((i) => i.platform === 'onebot')
        ?.internal.getVersionInfo()

      return `[SILI Core] v${SILI_CORE.version} (${GIT_HASH})
[Onebot] protocol ${ONEBOT.protocol_version} / go-cqhttp ${ONEBOT.version}
[Koishi.js] v${KOISHI_VERSION}`
    })
  }

  get logger() {
    return this.ctx.logger('VERSION')
  }
}
