/**
 * @name PluginName
 * @command command
 * @desc 这是一个插件
 * @authority 1
 */

import { Context } from 'koishi'

export default class PluginName {
  constructor(public ctx: Context) {}

  get logger() {
    return this.ctx.logger('PLUGIN')
  }
}
