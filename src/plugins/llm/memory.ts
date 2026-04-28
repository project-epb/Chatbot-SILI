import { Context } from 'koishi'

declare module 'koishi' {
  interface Tables {
    openai_user_memory: OpenAIUserMemory
  }
}

export interface OpenAIUserMemory {
  id: number
  platform: string
  user_id: string
  content: string
  byte_size: number
  last_updated_at: number
  last_check_at: number
  update_count: number
  message_count_at_update: number
}

export const NO_UPDATE_MAGIC = '<<NO_UPDATE>>'

export function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

export function truncateToByteLimit(s: string, limit: number): string {
  if (limit <= 0) return ''
  if (byteLength(s) <= limit) return s
  // 逐字符累积，直到超限
  let acc = ''
  let used = 0
  for (const ch of s) {
    const w = byteLength(ch)
    if (used + w > limit) break
    acc += ch
    used += w
  }
  return acc
}

export function isNoUpdateMagic(text: string): boolean {
  return text.trim() === NO_UPDATE_MAGIC
}

export class MemoryStore {
  constructor(private ctx: Context) {}

  static initSchema(ctx: Context): void {
    ctx.model.extend(
      'openai_user_memory',
      {
        id: 'unsigned',
        platform: 'string(64)',
        user_id: 'string(128)',
        content: 'text',
        byte_size: 'unsigned',
        last_updated_at: 'unsigned(20)',
        last_check_at: 'unsigned(20)',
        update_count: 'unsigned',
        message_count_at_update: 'unsigned',
      },
      {
        primary: 'id',
        autoInc: true,
        unique: [['platform', 'user_id']],
      }
    )
  }

  async get(platform: string, userId: string): Promise<string> {
    const meta = await this.getMeta(platform, userId)
    return meta?.content ?? ''
  }

  async getMeta(
    platform: string,
    userId: string
  ): Promise<OpenAIUserMemory | null> {
    const rows = await this.ctx.database.get('openai_user_memory', {
      platform,
      user_id: userId,
    })
    return rows[0] ?? null
  }

  async set(
    platform: string,
    userId: string,
    content: string,
    byteLimit: number,
    currentMessageCount: number
  ): Promise<void> {
    const truncated = truncateToByteLimit(content, byteLimit)
    const now = Date.now()
    const existing = await this.getMeta(platform, userId)
    if (existing) {
      await this.ctx.database.set(
        'openai_user_memory',
        { id: existing.id },
        {
          content: truncated,
          byte_size: byteLength(truncated),
          last_updated_at: now,
          last_check_at: now,
          update_count: existing.update_count + 1,
          message_count_at_update: currentMessageCount,
        }
      )
    } else {
      await this.ctx.database.create('openai_user_memory', {
        platform,
        user_id: userId,
        content: truncated,
        byte_size: byteLength(truncated),
        last_updated_at: now,
        last_check_at: now,
        update_count: 1,
        message_count_at_update: currentMessageCount,
      })
    }
  }

  async markChecked(
    platform: string,
    userId: string,
    currentMessageCount: number
  ): Promise<void> {
    const now = Date.now()
    const existing = await this.getMeta(platform, userId)
    if (existing) {
      await this.ctx.database.set(
        'openai_user_memory',
        { id: existing.id },
        {
          last_check_at: now,
          message_count_at_update: currentMessageCount,
        }
      )
    } else {
      await this.ctx.database.create('openai_user_memory', {
        platform,
        user_id: userId,
        content: '',
        byte_size: 0,
        last_updated_at: 0,
        last_check_at: now,
        update_count: 0,
        message_count_at_update: currentMessageCount,
      })
    }
  }
}
