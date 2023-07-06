import type { Mint } from 'mint-filter'
import type { HTMLService } from './utils/RenderHTML'
import type {} from '@koishijs/plugin-rate-limit'

declare module 'koishi' {
  import type { Context, DatabaseService } from 'koishi'

  interface Context {
    database: DatabaseService
    html: HTMLService
    mint: Mint
  }
}
