import { Adapter, type Context, Logger, Schema, type Session } from 'koishi'

import {
  type Pending,
  QueQiaoMinecraftBot,
  type QueQiaoMinecraftBotConfig,
} from './bot'
import type {
  MinecraftTextComponentList,
  QueQiaoApi,
  QueQiaoEvent,
  QueQiaoRequest,
  QueQiaoResponse,
} from './types'

export interface QueQiaoMinecraftAdapterConfig {
  bots: QueQiaoMinecraftBotConfig[]
  debug?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  requestTimeout?: number
}

export class QueQiaoMinecraftAdapter<
  C extends Context = Context,
> extends Adapter<C, QueQiaoMinecraftBot<C>> {
  private logger = new Logger('adapter-minecraft-queqiao')
  private debug: boolean
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private requestTimeout: number
  private reconnectAttempts = new Map<string, number>()

  constructor(
    ctx: C,
    private config: QueQiaoMinecraftAdapterConfig
  ) {
    super(ctx)

    this.debug = !!config.debug
    this.reconnectInterval = config.reconnectInterval ?? 5000
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10
    this.requestTimeout = config.requestTimeout ?? 10_000

    ctx.on('ready', async () => {
      for (const botConfig of config.bots) {
        const bot = new QueQiaoMinecraftBot(ctx, botConfig)
        bot.adapter = this
        this.bots.push(bot)
        await this.connectWebSocket(bot)
      }
    })
  }

  private logDebug(...args: any[]) {
    if (!this.debug) return
    this.logger.info('[DEBUG]', ...args)
  }

  private buildHeaders(
    bot: QueQiaoMinecraftBot,
    wsConfig: QueQiaoMinecraftBotConfig['websocket']
  ) {
    const headers: Record<string, string> = {
      'x-self-name': bot.config.serverName,
      ...(wsConfig.extraHeaders || {}),
    }
    if (wsConfig.accessToken) {
      headers['Authorization'] = `Bearer ${wsConfig.accessToken}`
    }
    return headers
  }

  private async connectWebSocket(bot: QueQiaoMinecraftBot) {
    const wsConfig = bot.config.websocket
    const headers = this.buildHeaders(bot, wsConfig)

    this.logDebug(`Connecting bot=${bot.selfId} url=${wsConfig.url}`)
    this.logDebug('Headers:', headers)

    const ws = this.ctx.http.ws(wsConfig.url, { headers })
    bot.ws = ws

    ws.addEventListener('open', () => {
      bot.online()
      this.reconnectAttempts.set(bot.selfId, 0)
      this.logger.info(`QueQiao WebSocket connected (${bot.selfId})`)
    })

    ws.addEventListener('message', (ev) => {
      const { data } = ev
      try {
        const text = typeof data === 'string' ? data : data.toString()
        this.logDebug(`WS recv (${bot.selfId}):`, text)
        const obj = JSON.parse(text)
        this.handleIncoming(bot, obj)
      } catch (err) {
        this.logger.warn(`Failed to parse WS message (${bot.selfId})`, err)
      }
    })

    ws.addEventListener('close', (ev) => {
      bot.offline()
      const { code, reason } = ev
      const reasonText = reason?.toString?.() || ''
      this.logger.warn(
        `QueQiao WebSocket closed (${bot.selfId}) code=${code} reason=${reasonText}`
      )
      this.scheduleReconnect(bot)
    })

    ws.addEventListener('error', (ev) => {
      this.logger.warn(`QueQiao WebSocket error (${bot.selfId})`, ev)
    })
  }

  private scheduleReconnect(bot: QueQiaoMinecraftBot) {
    const attempt = (this.reconnectAttempts.get(bot.selfId) || 0) + 1
    this.reconnectAttempts.set(bot.selfId, attempt)

    if (attempt > this.maxReconnectAttempts) {
      this.logger.error(
        `QueQiao WebSocket reconnect exceeded max attempts (${bot.selfId})`
      )
      return
    }

    setTimeout(() => {
      this.connectWebSocket(bot).catch((err) => {
        this.logger.warn(`Reconnect failed (${bot.selfId})`, err)
        this.scheduleReconnect(bot)
      })
    }, this.reconnectInterval)
  }

  private handleIncoming(bot: QueQiaoMinecraftBot, obj: any) {
    // response
    if (obj && obj.post_type === 'response') {
      const echo = obj.echo
      if (echo && bot.pending.has(echo)) {
        const pending = bot.pending.get(echo)!
        clearTimeout(pending.timeout)
        bot.pending.delete(echo)
        pending.resolve(obj)
      }
      return
    }

    // event
    const event = obj as QueQiaoEvent
    const session = this.createSession(bot, event)
    if (session) bot.dispatch(session)
  }

  private createSession(
    bot: QueQiaoMinecraftBot,
    payload: QueQiaoEvent
  ): Session | undefined {
    const postType = (payload as any)?.post_type
    const subType = (payload as any)?.sub_type
    const eventName = (payload as any)?.event_name

    let kind: 'chat' | 'join' | 'quit' | undefined

    if (
      postType === 'message' &&
      (subType === 'player_chat' || eventName === 'PlayerChatEvent')
    ) {
      kind = 'chat'
    } else if (
      postType === 'notice' &&
      (subType === 'player_join' || eventName === 'PlayerJoinEvent')
    ) {
      kind = 'join'
    } else if (
      postType === 'notice' &&
      (subType === 'player_quit' || eventName === 'PlayerQuitEvent')
    ) {
      kind = 'quit'
    }

    if (!kind) return

    const tsSeconds = Number((payload as any)?.timestamp || Date.now() / 1000)
    const timestamp = Math.floor(tsSeconds * 1000)
    const serverName =
      (payload as any)?.server_name || bot.config.serverName || 'minecraft'

    const player = (payload as any)?.player || {}
    const userId = player.uuid || player.nickname || 'unknown'
    const username = player.nickname || userId

    const baseEvent: any = {
      sn: Date.now(),
      platform: 'minecraft',
      selfId: bot.selfId,
      timestamp,
      user: { id: userId, name: username },
      channel: { id: serverName, type: 0 },
      guild: { id: serverName, name: serverName },
      referrer: payload,
    }

    if (kind === 'chat') {
      const rawCandidate =
        (payload as any)?.message != null
          ? (payload as any)?.message
          : (payload as any)?.raw_message

      const tryParseMaybeJson = (value: unknown): unknown => {
        if (typeof value !== 'string') return value
        const trimmed = value.trim()
        if (!trimmed) return value
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
        try {
          return JSON.parse(trimmed)
        } catch {
          return value
        }
      }

      let content: any
      const parsed = tryParseMaybeJson(rawCandidate)
      if (parsed && (typeof parsed === 'object' || Array.isArray(parsed))) {
        try {
          content = bot.fromMinecraftTextComponents(parsed)
        } catch {
          content = this.extractText(parsed)
        }
      } else {
        content = this.extractText(rawCandidate)
      }

      const text = String(content ?? '')

      baseEvent.type = 'message'
      baseEvent.message = {
        id: String((payload as any)?.message_id || Date.now()),
        content: text,
        user: baseEvent.user,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      const session = bot.session(baseEvent)
      session.content = text
      return session
    }

    if (kind === 'join') {
      baseEvent.type = 'guild-member-added'
      baseEvent.member = { user: baseEvent.user, joinedAt: timestamp }
      return bot.session(baseEvent)
    }

    if (kind === 'quit') {
      baseEvent.type = 'guild-member-removed'
      baseEvent.member = { user: baseEvent.user }
      return bot.session(baseEvent)
    }

    return
  }

  private extractText(message: unknown): string {
    if (message == null) return ''
    if (typeof message === 'string') {
      const s = message
      const trimmed = s.trim()

      // 某些实现会把 TextComponent/RawText 作为 JSON 字符串返回，例如：{"text":"!help"}
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          return this.extractText(parsed)
        } catch {
          // ignore
        }
      }

      return s
    }
    if (typeof message === 'number' || typeof message === 'boolean') {
      return String(message)
    }

    if (Array.isArray(message)) {
      return message.map((m) => this.extractText(m)).join('')
    }

    if (typeof message === 'object') {
      const obj: any = message

      // Minecraft RawText / TextComponent 常见字段：text + extra
      let acc = ''
      if (typeof obj.text === 'string') acc += obj.text
      else if (typeof obj.content === 'string') acc += obj.content

      // 兼容 translate/with（尽量提取参数文本，不做本地化翻译）
      if (!acc && typeof obj.translate === 'string' && obj.with) {
        acc += this.extractText(obj.with)
      }

      if (obj.extra) acc += this.extractText(obj.extra)
      return acc
    }

    return String(message)
  }

  private async sendRequest<TData, TResp>(
    bot: QueQiaoMinecraftBot,
    api: QueQiaoApi,
    data: TData
  ): Promise<QueQiaoResponse<TResp>> {
    if (!bot.ws || bot.ws.readyState !== WebSocket.OPEN) {
      throw new Error('QueQiao WebSocket not connected')
    }

    const echo = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const req: QueQiaoRequest<TData> = { api, data, echo }

    const p = new Promise<QueQiaoResponse<TResp>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        bot.pending.delete(echo)
        reject(new Error(`QueQiao request timeout: ${api}`))
      }, this.requestTimeout)

      bot.pending.set(echo, { resolve, reject, timeout } satisfies Pending)
    })

    this.logDebug(`WS send (${bot.selfId}):`, req)
    bot.ws.send(JSON.stringify(req))

    const resp = await p
    return resp
  }

  async broadcast(
    bot: QueQiaoMinecraftBot,
    content: any,
    options?: { sendAs?: string; groupName?: string }
  ) {
    const sender = options?.sendAs || bot.selfId
    let message: MinecraftTextComponentList
    try {
      message = bot.toMinecraftTextComponents(content)
    } catch {
      message = [{ text: bot.pruneMessage(content) }]
    }

    const components = bot.toBroadcastComponents(
      message,
      sender,
      options?.groupName
    )

    await this.sendRequest(bot, 'broadcast', { message: components })
  }

  async sendPrivateMessage(
    bot: QueQiaoMinecraftBot,
    target: { uuid?: string; nickname?: string },
    content: any,
    options?: { sendAs?: string; groupName?: string }
  ) {
    const sender = options?.sendAs || bot.selfId
    let message: MinecraftTextComponentList
    try {
      message = bot.toMinecraftTextComponents(content)
    } catch {
      message = [{ text: bot.pruneMessage(content) }]
    }

    const components = bot.toBroadcastComponents(
      message,
      sender,
      options?.groupName
    )

    await this.sendRequest(bot, 'send_private_msg', {
      uuid: target.uuid ?? null,
      nickname: target.nickname ?? null,
      message: components,
    })
  }

  async sendRconCommand(
    bot: QueQiaoMinecraftBot,
    command: string
  ): Promise<string> {
    const resp = await this.sendRequest<{ command: string }, string>(
      bot,
      'send_rcon_command',
      { command }
    )

    if (resp.status !== 'SUCCESS') {
      throw new Error(`RCON failed: ${resp.message || resp.status}`)
    }

    return String(resp.data ?? '')
  }

  async stop() {
    for (const bot of this.bots) {
      try {
        bot.ws?.close()
      } catch {
        // ignore
      }
      for (const pending of bot.pending.values()) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Adapter stopped'))
      }
      bot.pending.clear()
    }
  }
}

export namespace QueQiaoMinecraftAdapter {
  export const Config: Schema<QueQiaoMinecraftAdapterConfig> = Schema.object({
    debug: Schema.boolean().default(false),
    reconnectInterval: Schema.number().default(5000),
    maxReconnectAttempts: Schema.number().default(10),
    requestTimeout: Schema.number().default(10_000),
    bots: Schema.array(
      Schema.object({
        selfId: Schema.string().required(),
        serverName: Schema.string().required(),
        websocket: Schema.object({
          url: Schema.string().required(),
          accessToken: Schema.string(),
          extraHeaders: Schema.dict(Schema.string()),
        }).required(),
      })
    ).default([]),
  })
}

export default QueQiaoMinecraftAdapter
