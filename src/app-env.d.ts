import { DatabaseService } from 'koishi'
import type { Mint } from 'mint-filter'
import type { HTMLService } from './utils/RenderHTML'
import {} from '@koishijs/plugin-rate-limit'

declare module 'koishi' {
  interface Context {
    database: DatabaseService
    html: HTMLService
    mint: Mint
  }
}

export {}
