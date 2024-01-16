import { Adapter, Bot, Context, Fragment, Logger, h } from 'koishi'

import { SendOptions } from '@satorijs/protocol'

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
  public ws?: ReturnType<C['http']['ws']>

  constructor(
    public ctx: C,
    config: Config
  ) {
    config = { ...MinecraftBot.defaultConfig, ...config }
    super(ctx, config)
    this.platform = 'minecraft'
    this.ctx.root.plugin(AdapterMinecraft, this)
  }

  get serverURL() {
    const url = new URL(`ws://localhost`)
    url.hostname = this.config.host
    url.port = this.config.port.toString()
    url.protocol = this.config.protocol
    return url
  }

  async sendMessage(
    channelId: string,
    content: Fragment,
    guildId?: string,
    options?: SendOptions & {
      sendAs?: string
    }
  ): Promise<string[]> {
    this.ws.send(
      JSON.stringify({
        Name: options.sendAs || this.ctx.root.config.name || 'koishi',
        Content: this.stringifyContent(content),
      })
    )
    return []
  }

  async sendMessageAs(username: string, content: Fragment) {
    return this.sendMessage('0', content, undefined, {
      sendAs: username,
    })
  }

  stringifyContent(content: Fragment) {
    const elements = h.parse(content.toString())
    console.log('[[stringifyContent]] income:', content, elements)
    return elements
      .map((el) => {
        console.log('[[stringifyContent]] map:', el)
        if (el.type === 'text') return el
        switch (el.type) {
          default:
            return el
          case 'at':
            return h.text(`@${el.attrs.name || el.attrs.id}`)
          case 'img':
          case 'image':
            return h.text('[图片]')
          case 'video':
            return h.text('[视频]')
          case 'audio':
            return h.text('[音频]')
          case 'file':
            return h.text('[文件]')
          case 'face':
            return h.text('[表情]')
        }
      })
      .join('')
  }
}

export class AdapterMinecraft extends Adapter.WsClient<
  Context,
  MinecraftBot<Context>
> {
  protected async prepare() {
    const ws = this.ctx.http.ws(this.bot.serverURL.href, {
      headers: {
        authorization: `Bot ${this.bot.config.token}`,
      },
    })
    this.bot.ws = ws
    return ws
  }
  protected accept(): void {
    this.bot.online()
    // this.bot.sendMessage('0', 'SILI is online')
    this.socket.addEventListener('message', (msg: any) => {
      const data: {
        Name: string
        Content: string
      } = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
      logger.info('[message]', data)
      const user = {
        id: 'MC:' + data.Name,
        name: data.Name,
      }
      const channel = {
        id: '0',
        type: 0,
      }
      const session = this.bot.session({
        type: 'message',
        user,
        channel,
        message: {
          user,
        },
      })
      session.content = data.Content
      this.bot.dispatch(session)
    })
  }
}
