/**
 * @name version
 * @command version
 * @desc 这是一个插件
 * @authority 1
 */

import { Context, h, version as KOISHI_VERSION } from 'koishi'

export default class PluginVersion {
  static using = ['html', 'shell']

  constructor(public ctx: Context) {
    ctx
      .command('version', '查看SILI版本信息')
      .option('all', '-a', { authority: 2 })
      .action(async ({ options }) => {
        const { output: gitHashInfo } = await ctx.shell.exec(
          'git rev-parse --short HEAD'
        )
        const siliCoreInfo = (
          await import('../../package.json', { assert: { type: 'json' } })
        ).default
        const onebotInfo = await ctx.bots
          .find((i) => i.platform === 'onebot')
          ?.internal.getVersionInfo()

        if (!options!.all) {
          return `[SILI Core] v${siliCoreInfo.version} (${gitHashInfo?.trim()})
[Onebot] protocol ${onebotInfo?.protocol_version} / go-cqhttp ${
            onebotInfo?.version
          }
[Koishi.js] v${KOISHI_VERSION}`
        }

        const plugins = Object.keys(siliCoreInfo.dependencies)
          .filter(
            (i) =>
              i.startsWith('@koishijs/plugin-') ||
              i.startsWith('koishi-plugin-')
          )
          .map(
            (i) =>
              `${i.replace(/^(@koishijs\/|koishi-)/, '')}: ${
                siliCoreInfo.dependencies[i]
              }`
          )

        const img = await ctx.html.hljs(
          [
            `[SILI Core] v${siliCoreInfo.version} (${gitHashInfo})`,
            `[Onebot] protocol ${onebotInfo?.protocol_version} / go-cqhttp ${onebotInfo?.version}`,
            `[Koishi.js] v${KOISHI_VERSION}`,
            `  - ${plugins.join('\n  - ')}`,
          ].join('\n'),
          'markdown'
        )
        return img || '检查版本时发生未知错误。'
      })
  }

  get logger() {
    return this.ctx.logger('VERSION')
  }
}
