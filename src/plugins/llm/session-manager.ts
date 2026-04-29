import { Context } from 'koishi'

declare module 'koishi' {
  interface Tables {
    openai_session: OpenAISession
  }
}

export interface OpenAISession {
  id: number
  conversation_id: string
  conversation_owner: number
  platform: string
  user_id: string
  started_at: number
  /** Snapshot of the role/persona prompt at session start. */
  base_prompt: string
  /** Snapshot of the rendered command catalog at session start. */
  command_catalog: string
  /** Snapshot of the user's long-term memory at session start. */
  memory_snapshot: string
}

export interface CreateSessionInput {
  conversationId: string
  conversationOwner: number
  platform: string
  userId: string
  basePrompt: string
  commandCatalog: string
  memorySnapshot: string
}

export class SessionManager {
  constructor(private ctx: Context) {}

  static initSchema(ctx: Context): void {
    ctx.model.extend(
      'openai_session',
      {
        id: 'unsigned',
        conversation_id: 'string(64)',
        conversation_owner: 'integer',
        platform: 'string(64)',
        user_id: 'string(128)',
        started_at: 'unsigned(20)',
        base_prompt: 'text',
        command_catalog: 'text',
        memory_snapshot: 'text',
      },
      {
        primary: 'id',
        autoInc: true,
        unique: [['conversation_id']],
        indexes: [['conversation_owner', 'started_at']],
      }
    )
  }

  async get(conversationId: string): Promise<OpenAISession | null> {
    const rows = await this.ctx.database.get('openai_session', {
      conversation_id: conversationId,
    })
    return rows[0] ?? null
  }

  async create(input: CreateSessionInput): Promise<OpenAISession> {
    const row = await this.ctx.database.create('openai_session', {
      conversation_id: input.conversationId,
      conversation_owner: input.conversationOwner,
      platform: input.platform,
      user_id: input.userId,
      started_at: Date.now(),
      base_prompt: input.basePrompt,
      command_catalog: input.commandCatalog,
      memory_snapshot: input.memorySnapshot,
    })
    return row
  }

  /**
   * Look up an existing session by conversation_id, or create one with the
   * provided snapshot. The session is frozen at creation; later writes to
   * memory or rebuilds of the command catalog do not retroactively modify it.
   * Users get a fresh snapshot by running `llm.reset` (which clears
   * `user.openai_last_conversation_id`, so the next message lands here with
   * no existing session and triggers a new create).
   */
  async getOrCreate(input: CreateSessionInput): Promise<OpenAISession> {
    const existing = await this.get(input.conversationId)
    if (existing) return existing
    return this.create(input)
  }
}

/** Subset needed to render a system prompt — accepts both DB rows and synthetic objects. */
export interface SessionSnapshot {
  base_prompt: string
  command_catalog: string
  memory_snapshot: string
}

/**
 * Render a session's frozen snapshot into a complete system prompt text.
 * Pure function — same input always produces the same output, which is the
 * whole point of the frozen-snapshot design (preserves prefix cache).
 */
export function composeSystemPrompt(session: SessionSnapshot): string {
  const parts: string[] = [session.base_prompt]
  if (session.command_catalog) {
    parts.push(session.command_catalog)
    parts.push(
      [
        '## 调用工具',
        '调用 `execute_koishi_command` 时传入 `name`、`args`、`options`。',
        '调用前请确认指令存在于上述清单中。',
      ].join('\n')
    )
  }
  if (session.memory_snapshot) {
    parts.push(
      [
        '## 关于这个用户的长期记忆',
        session.memory_snapshot,
        '以上记忆由系统周期性自动维护，对话中可参考但不要主动更新。',
      ].join('\n\n')
    )
  }
  return parts.join('\n\n')
}
