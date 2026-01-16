import { Bot, type Context } from 'koishi'

import type { SendOptions } from '@satorijs/protocol'

import type { QueQiaoMinecraftAdapter } from './adapter'
import {
  fromMinecraftTextComponents,
  pruneMessage,
  toBroadcastComponents,
  toMinecraftTextComponents,
} from './message-builder'
import type {
  MinecraftTextComponent,
  MinecraftTextComponentList,
} from './types'

export interface QueQiaoMinecraftBotConfig {
  selfId: string
  serverName: string
  websocket: {
    url: string
    accessToken?: string
    extraHeaders?: Record<string, string>
  }
}

export type Pending = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timeout: NodeJS.Timeout
}

export class QueQiaoMinecraftBot<C extends Context = Context> extends Bot<
  C,
  QueQiaoMinecraftBotConfig
> {
  ws?: WebSocket
  pending = new Map<string, Pending>()

  constructor(ctx: C, config: QueQiaoMinecraftBotConfig) {
    super(ctx, config, 'minecraft')
    this.selfId = config.selfId
  }

  async sendMessage(
    channelId: string,
    content: any,
    _guildId?: string,
    options?: SendOptions & { sendAs?: string; groupName?: string }
  ): Promise<string[]> {
    const adapter = this.adapter as unknown as QueQiaoMinecraftAdapter
    const sender =
      options?.sendAs || this.ctx.root.config.name || this.selfId || 'Koishi'

    // 约定：channelId 以 mc: 开头则私聊，否则广播
    if (channelId?.startsWith('mc:')) {
      const nickname = channelId.slice(3)
      await adapter.sendPrivateMessage(this, { nickname }, content, {
        sendAs: sender,
        groupName: options?.groupName,
      })
      return []
    }

    await adapter.broadcast(this, content, {
      sendAs: sender,
      groupName: options?.groupName,
    })
    return []
  }

  async sendMessageAs(username: string, content: any, groupName?: string) {
    return this.sendMessage('broadcast', content, undefined, {
      sendAs: username,
      groupName,
    })
  }

  async rconCommand(command: string): Promise<string> {
    const adapter = this.adapter as unknown as QueQiaoMinecraftAdapter
    return adapter.sendRconCommand(this, command)
  }

  pruneMessage(content: any) {
    return pruneMessage(content)
  }

  toMinecraftTextComponents(content: any) {
    return toMinecraftTextComponents(content)
  }

  fromMinecraftTextComponents(raw: unknown) {
    return fromMinecraftTextComponents(raw)
  }

  toBroadcastComponents(
    message: MinecraftTextComponent | MinecraftTextComponentList,
    sender: string,
    groupName?: string
  ) {
    return toBroadcastComponents(message, sender, groupName)
  }
}
