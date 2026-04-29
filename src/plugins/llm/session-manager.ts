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
  /** Last time this session was used; the session is considered fresh until
   *  now - last_used_at exceeds the configured idle timeout. */
  last_used_at: number
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
        last_used_at: 'unsigned(20)',
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
    const now = Date.now()
    const row = await this.ctx.database.create('openai_session', {
      conversation_id: input.conversationId,
      conversation_owner: input.conversationOwner,
      platform: input.platform,
      user_id: input.userId,
      started_at: now,
      last_used_at: now,
      base_prompt: input.basePrompt,
      command_catalog: input.commandCatalog,
      memory_snapshot: input.memorySnapshot,
    })
    return row
  }

  /** Bump last_used_at to "now" (fire-and-forget; failures are non-fatal). */
  async touch(sessionRowId: number): Promise<void> {
    await this.ctx.database.set(
      'openai_session',
      { id: sessionRowId },
      { last_used_at: Date.now() }
    )
  }

  /**
   * Fetch the active session for a conversation_id, honoring the idle
   * timeout. Returns one of:
   *   - { session, expired: false } — fresh session, safe to reuse
   *   - { session: null, expired: true } — session exists but stale; caller
   *     should rotate (issue a new conversation_id and create a new session)
   *   - { session: null, expired: false } — no session at all yet
   */
  async getActive(
    conversationId: string,
    idleTtlMs: number
  ): Promise<{ session: OpenAISession | null; expired: boolean }> {
    const row = await this.get(conversationId)
    if (!row) return { session: null, expired: false }
    if (isSessionExpired(row, idleTtlMs)) {
      return { session: null, expired: true }
    }
    return { session: row, expired: false }
  }
}

/** Pure helper so it can be unit-tested without a koishi context. */
export function isSessionExpired(
  session: Pick<OpenAISession, 'last_used_at'>,
  idleTtlMs: number,
  now: number = Date.now()
): boolean {
  if (idleTtlMs <= 0) return false // 0 / negative disables expiry
  return now - session.last_used_at > idleTtlMs
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
        '',
        '**清单只是概览**，没有列出每条指令的参数和选项。要看具体用法，先用 `help` 查询：',
        '- `execute_koishi_command(name="help", args=["指令名"])` → 返回该指令的参数说明、选项列表、子命令等详情',
        '- 不熟悉的指令**先 help 再调用**，避免参数出错',
        '',
        '**指令命名规则**（Koishi 把"分类"和"命名空间"用不同符号区分）：',
        '- `foo.bar` （**点号** = 命名空间）：实际 `name` 就是 `"foo.bar"`，整体是命令的唯一名',
        '- `foo/bar` （**斜杠** = 分类）：实际 `name` 仅是 `"bar"`，斜杠前的部分只是用来在清单里分组显示，不属于 `name`',
        '',
        '示例：',
        '- 清单里 `pixiv.illust` → 调用 `name: "pixiv.illust"`',
        '- 清单里 `tools/homo` → 调用 `name: "homo"`（不要传 `"tools/homo"`，否则会找不到）',
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
