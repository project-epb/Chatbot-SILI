import { Context, Logger, snakeCase } from 'koishi'

export default class BasePlugin<T = any> {
  #name: string

  constructor(
    public ctx: Context,
    public options: T = undefined,
    name = 'plugin'
  ) {
    this.name = name
    this.options = options || ({} as T)
  }

  set name(name: string) {
    this.#name = snakeCase(name).toUpperCase()
  }
  get name() {
    return this.#name
  }

  get logger(): Logger {
    return this.ctx.logger(this.name)
  }
}
