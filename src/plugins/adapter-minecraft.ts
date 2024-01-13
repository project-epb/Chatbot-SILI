import { Adapter, Bot, Context, Logger, Session } from 'koishi'

export interface Config extends Adapter.WsClientConfig {
  host: string
  port: number
  protocol: 'ws' | 'wss'
  token: string
}

const logger = new Logger('adapter-mc')

export class MinecraftBot<C extends Context> extends Bot<C, Config> {
  static defaultConfig: Config = {
    host: 'localhost',
    port: 25566,
    protocol: 'ws',
    token: '',
  }

  constructor(
    public ctx: C,
    config: Config
  ) {
    config = { ...MinecraftBot.defaultConfig, ...config }
    super(ctx, config)
    this.platform = 'minecraft'
  }

  get serverURL() {
    const url = new URL(`ws://localhost`)
    url.hostname = this.config.host
    url.port = this.config.port.toString()
    url.protocol = this.config.protocol
    return url
  }
}

export class AdapterMinecraft extends Adapter.WsClient<
  Context,
  MinecraftBot<Context>
> {
  protected async prepare() {
    return this.ctx.http.ws(this.bot.serverURL.href, {
      headers: {
        authorization: `Bot ${this.bot.config.token}`,
      },
    })
  }
  protected accept(): void {
    this.bot.online()
    this.socket.addEventListener('message', (raw: any) => {
      const data = JSON.parse(raw.toString())
      logger.info('[recieved]', raw, data)

      // if (!this.bot.) return
    })
  }
}
