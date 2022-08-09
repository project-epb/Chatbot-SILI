/**
 * @name PluginSiliName
 * @command siliname
 * @desc 让SILI修改自己的群名片
 * @authority 3
 */

import { Context } from 'koishi'
import {} from '@koishijs/plugin-adapter-onebot'
import { resolveBrackets } from '../utils/resolveBrackets'

export default class PluginSiliName {
  constructor(public ctx: Context) {
    ctx = ctx.channel()

    ctx
      .command('admin/siliname <name:text>', '让SILI修改自己的群名片', {
        authority: 3,
      })
      .action(async ({ session }, name) => {
        if (!name || !session) return
        try {
          await session?.onebot?.setGroupCard(
            session.channelId as string,
            session.bot.selfId,
            resolveBrackets(name)
          )
          return `明白了，请叫我“${name}”。`
        } catch (err) {
          return '对不起，我目前无法修改称呼。'
        }
      })
  }

  get logger() {
    return this.ctx.logger('PLUGIN')
  }
}
