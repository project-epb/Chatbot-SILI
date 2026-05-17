import { type MemoryStore, byteLength } from '../services/memory'
import type { ToolDefinition } from '../providers/_base'

import type { MemoryToolState } from './read-user-memory'

export interface SaveUserMemoryInput {
  content: string
}

export interface SaveUserMemoryDeps {
  memory: Pick<MemoryStore, 'getMeta' | 'set'>
  platform: string
  userId: string
  conversationId: string
  /**
   * Returns the current user-message count in this conversation. Same
   * source of truth as the memory-fork scheduler so a successful save
   * also pushes `message_count_at_update` forward, which defers the
   * next periodic fork by `memoryUpdateInterval` messages (i.e. main
   * agent's active update counts as a recent reflection — fork won't
   * fire again until enough new messages have accumulated since).
   */
  getCurrentUserMessageCount: () => Promise<number>
  /** Hard byte limit (UTF-8). Inputs above this are rejected. */
  hardLimit: number
}

/**
 * Build the save_user_memory tool definition with the byte limit baked
 * into the description (so the agent sees a concrete number).
 */
export function buildSaveUserMemoryTool(hardLimit: number): ToolDefinition {
  return {
    name: 'save_user_memory',
    description: [
      '完整覆写用户长期记忆文档（不是 patch）。每 turn 必须先 `read_user_memory`，且只能调一次；read 之后若被后台反思任务改过，会被乐观锁拒绝并要求重读。',
      '',
      '**何时调**：用户主动声明的身份/强偏好/跨会话事实（"我叫 X"、"以后别叫我 Y"、"我是前端工程师"）。',
      '',
      '**何时不调**：闲聊里冒出的事实、本次任务进度、性格推断、已在记忆里、可立即重新发现的常识。',
      '',
      '**特别地**：用户要改 SILI 自己的人设/语气（"别俏皮"、"用敬语"）一律不记——SILI 有固定人设。区分点：改 SILI 本身（不记） vs 改 SILI 如何对待这个用户（可记，如"不喜欢被叫老板"）。',
      '',
      '**写法**（基于 read 现有结构增改）：',
      '- 按 `## 主题` 分组，一条一行 `- ...`',
      '- **声明式，不要命令式**：✓「用户偏好简洁回复」 ✗「回复要简洁」（命令式会被未来轮当指令执行）',
      '- 时间敏感事项末尾标日期 `（YYYY-MM-DD 写入）`，从最近 `<turn_context>` 的 `time` 字段取',
      '',
      `硬上限 ${hardLimit} 字节（UTF-8）；空白内容会被拒绝。`,
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            '完整新档案内容（markdown），覆盖现有 memory。基于 read_user_memory 拿到的内容增改后给出整份。',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  }
}

export async function runSaveUserMemory(
  input: SaveUserMemoryInput | undefined,
  state: MemoryToolState,
  deps: SaveUserMemoryDeps
): Promise<string> {
  if (!state.hasReadInTurn) {
    return 'Error: please call read_user_memory first to see current content before saving.'
  }
  if (state.savedThisTurn) {
    return 'Error: save_user_memory has already been used in this turn. Combine all updates into a single call.'
  }
  if (typeof input?.content !== 'string') {
    return 'Error: tool input missing required field "content"'
  }
  const trimmed = input.content.trim()
  if (!trimmed) {
    return 'Error: content is empty or whitespace only — refusing to overwrite memory with nothing. To make no change, simply do not call this tool.'
  }
  const size = byteLength(trimmed)
  if (size > deps.hardLimit) {
    return `Error: content is ${size} bytes, exceeds hard limit ${deps.hardLimit} bytes. Trim less important entries and try again.`
  }
  const cur = await deps.memory.getMeta(deps.platform, deps.userId)
  const currentUpdatedAt = cur?.last_updated_at ?? 0
  if (currentUpdatedAt !== state.lastSeenUpdatedAt) {
    // memory was changed under us (likely by a background fork). Force the
    // agent to re-read so its merge is based on the latest content.
    state.hasReadInTurn = false
    state.lastSeenUpdatedAt = 0
    return 'Error: memory was modified after your last read (possibly by a background reflection task). Call read_user_memory again to see the latest content, merge your changes, and save again.'
  }
  const messageCount = await deps.getCurrentUserMessageCount()
  await deps.memory.set(
    deps.platform,
    deps.userId,
    trimmed,
    messageCount,
    deps.conversationId
  )
  state.savedThisTurn = true
  return `OK: memory updated (${size} bytes).`
}
