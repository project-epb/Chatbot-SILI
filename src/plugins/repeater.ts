import { Context, Dict, Session, h } from 'koishi'

import BasePlugin from './_boilerplate'

// Types
export interface RepeatState {
  content: string
  repeated: boolean
  times: number
  users: Dict<number>
}

export interface Config {
  onRepeat?: (state: RepeatState, session: Session) => any
  onInterrupt?: (state: RepeatState, session: Session) => any
}

export default class PluginRepeater extends BasePlugin {
  constructor(ctx: Context, config?: Config) {
    super(ctx, config, 'repeater')

    // this.onRepeatHandler()
    // this.onInterruptHandler()
    this.listenQqEmoji()
  }

  private readonly statusStore = new Map<string, RepeatState>()
  private getStatusKey(session: Session) {
    return `${session.platform}:${session.channelId}`
  }

  onRepeatHandler() {
    this.ctx.middleware(async (session, next) => {
      await next()
      const { content, userId } = session
      if (!content) return

      const key = this.getStatusKey(session)
      let state = this.statusStore.get(key)
      if (!state) {
        state = {
          content,
          repeated: false,
          times: 1,
          users: { [userId]: 1 },
        }
        this.statusStore.set(key, state)
      } else {
        if (state.content !== content) {
          state.content = content
          state.times = 0
          state.users = {}
        }
        state.times += 1
        state.users[userId] = (state.users[userId] || 0) + 1
      }

      if (state.times > 2) {
        const msg = this.config.onRepeat?.(state, session)
        if (msg) {
          state.repeated = true
          if (
            typeof msg === 'string' ||
            Array.isArray(msg) ||
            h.isElement(msg)
          ) {
            session.send(msg)
          } else {
            session.send(content)
          }
        }
      }
    })
  }

  onInterruptHandler() {
    this.ctx.middleware(async (session, next) => {
      await next()
      const { userId, channelId, platform } = session
      const key = `${platform}:${channelId}`
      const state = this.statusStore.get(key)
      if (!state) return

      if (state.repeated && state.users[userId] === state.times) {
        this.config.onInterrupt?.(state, session)
        this.statusStore.delete(key)
      }
    })
  }

  // 一些能够接龙的QQ表情
  listenQqEmoji() {
    const DRAGONS = [392, 393, 394]
    const TRAINS = [419, 420, 421]

    this.ctx.platform('onebot').middleware(async (session, next) => {
      await next()

      const faces = h.select(session.elements, 'face')

      if (faces.length === 1) {
        const faceId = parseInt(faces[0].attrs.id)

        // 龙 自动接下一个
        if (DRAGONS.includes(faceId)) {
          session.send(
            h('face', { ...faces[0].attrs, id: Math.min(394, faceId + 1) })
          )
        }
        // TODO: 火车头 不确定机制
        else if (TRAINS.includes(faceId)) {
          session.send(
            h('face', { ...faces[0].attrs, /** id: Math.min(421, faceId + 1) */ })
          )
        }
      }
    })
  }
}
