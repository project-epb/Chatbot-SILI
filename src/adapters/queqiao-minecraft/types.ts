export type QueQiaoApi =
  | 'broadcast'
  | 'send_private_msg'
  | 'send_title'
  | 'send_actionbar'
  | 'send_rcon_command'

export interface QueQiaoRequest<T = unknown> {
  api: QueQiaoApi
  data: T
  echo: string
}

export interface QueQiaoResponse<T = unknown> {
  code: number
  post_type: 'response'
  status: string
  message: string
  data?: T
  echo?: string
}

export interface QueQiaoPlayer {
  nickname?: string
  uuid?: string
  is_op?: boolean
  address?: string
  health?: number
  max_health?: number
  experience_level?: number
  experience_progress?: number
  total_experience?: number
  walk_speed?: number
  x?: number
  y?: number
  z?: number
}

export interface QueQiaoBaseEvent {
  timestamp: number
  post_type: string
  event_name: string
  server_name: string
  server_version?: string
  server_type?: string
  sub_type?: string
}

export interface QueQiaoPlayerChatEvent extends QueQiaoBaseEvent {
  post_type: 'message'
  event_name: 'PlayerChatEvent'
  sub_type: 'player_chat'
  message_id: string
  raw_message: string
  player: QueQiaoPlayer
  message: unknown
}

export interface QueQiaoPlayerJoinEvent extends QueQiaoBaseEvent {
  post_type: 'notice'
  event_name: 'PlayerJoinEvent'
  sub_type: 'player_join'
  player: QueQiaoPlayer
}

export interface QueQiaoPlayerQuitEvent extends QueQiaoBaseEvent {
  post_type: 'notice'
  event_name: 'PlayerQuitEvent'
  sub_type: 'player_quit'
  player: QueQiaoPlayer
}

export type QueQiaoEvent =
  | QueQiaoPlayerChatEvent
  | QueQiaoPlayerJoinEvent
  | QueQiaoPlayerQuitEvent
  | (QueQiaoBaseEvent & Record<string, unknown>)

export type MinecraftTextComponent =
  | string
  | {
      text?: string
      color?: string
      bold?: boolean
      italic?: boolean
      underlined?: boolean
      strikethrough?: boolean
      obfuscated?: boolean

      // Vanilla JSON text component events
      clickEvent?: {
        action: string
        value: string
      }
      hoverEvent?: {
        action: string
        value: MinecraftTextComponent
      }
      insertion?: string

      extra?: MinecraftTextComponent[]
    }

export type MinecraftTextComponentList = MinecraftTextComponent[]
