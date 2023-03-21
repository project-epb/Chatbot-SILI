import { Context, snakeCase } from 'koishi'

export default class BasePlugin {
  #name: string

  constructor(public ctx: Context, public options = {}, name = 'plugin') {
    this.name = name
  }

  set name(name: string) {
    this.#name = snakeCase(name).toUpperCase()
  }
  get name() {
    return this.#name
  }

  get logger() {
    return this.ctx.logger(this.name)
  }
}
