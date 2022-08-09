/**
 * @name PluginProfile
 * @command profile
 * @desc 基本资料
 * @authority 1
 */

import { Context } from 'koishi'

export default class PluginProfile {
  constructor(public ctx: Context) {
    ctx
      .command('admin/profile', '基本资料', {})
      .userFields(['id', 'authority', 'name'])
      .action(({ session }) => {
        if (!session) return
        return [
          `[基本资料] ${session.user?.id}`,
          `昵称: ${session.user?.name || '-'}`,
          `权限: ${session.user?.authority || 0}`,
        ].join('\n')
      })
  }

  get logger() {
    return this.ctx.logger('PLUGIN')
  }
}
