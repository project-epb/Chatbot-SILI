/**
 * @name version
 * @command version
 * @desc 这是一个插件
 * @authority 1
 */

 import { Context, Session, version as koishiVersion } from 'koishi'

 export const name = 'version'
 
 export default class PluginVersion {
   constructor(public ctx: Context) {
     ctx.command('version', '查看SILI版本信息').action(async ({ session }) => {
       const SILI_CORE = (
         await import('../../package.json', { assert: { type: 'json' } })
       ).default
       const ONEBOT = await ctx.bots
         .find((i) => i.platform === 'onebot')
         ?.internal.getVersionInfo()
 
       console.info(ctx.plugin.prototype)
 
       return `[SILICore] v${SILI_CORE.version}
 [Onebot] protocol ${ONEBOT.protocol_version} / go-cqhttp ${ONEBOT.version}
 [Koishi.js] v${koishiVersion}`
     })
   }
 
   get logger() {
     return this.ctx.logger('VERSION')
   }
 }
 