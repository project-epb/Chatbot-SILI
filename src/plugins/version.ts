/**
 * @name version
 * @command version
 * @desc 这是一个插件
 * @authority 1
 */

import { Context, h, version as KOISHI_VERSION } from 'koishi'
import { execSync } from 'child_process'

export default class PluginVersion {
  static using = ['html']

  constructor(public ctx: Context) {
    ctx
      .command('version', '查看SILI版本信息')
      .option('all', '-a', { authority: 2 })
      .action(async ({ options }) => {
        const GIT_HASH = execSync('git rev-parse --short HEAD')
          .toString()
          .trim()
        const SILI_CORE = (
          await import('../../package.json', { assert: { type: 'json' } })
        ).default
        const ONEBOT = await ctx.bots
          .find((i) => i.platform === 'onebot')
          ?.internal.getVersionInfo()

        if (!options!.all) {
          return `[SILI Core] v${SILI_CORE.version} (${GIT_HASH})
[Onebot] protocol ${ONEBOT.protocol_version} / go-cqhttp ${ONEBOT.version}
[Koishi.js] v${KOISHI_VERSION}`
        }

        const plugins = Object.keys(SILI_CORE.dependencies)
          .filter(
            (i) =>
              i.startsWith('@koishijs/plugin-') ||
              i.startsWith('koishi-plugin-')
          )
          .map(
            (i) =>
              `${i.replace(/^(@koishijs\/|koishi-)/, '')}: ${
                SILI_CORE.dependencies[i]
              }`
          )

        const img = await ctx.html.hljs(
          [
            `[SILI Core] v${SILI_CORE.version} (${GIT_HASH})`,
            `[Onebot] protocol ${ONEBOT.protocol_version} / go-cqhttp ${ONEBOT.version}`,
            `[Koishi.js] v${KOISHI_VERSION}`,
            `  - ${plugins.join('\n  - ')}`,
          ].join('\n'),
          'markdown'
        )
        return img ? h.image(img) : '检查版本时发生未知错误。'
      })
  }

  get logger() {
    return this.ctx.logger('VERSION')
  }
}
