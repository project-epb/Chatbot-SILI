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
      '更新当前用户的长期记忆文档（完整覆写，不是 patch）。',
      '',
      '**调用前提**（不满足直接报错）：',
      '- 本 turn 内必须先调过 `read_user_memory` 看到当前内容',
      '- 一个 turn 内只能调用一次：把所有想加/改的合并到一份完整内容里再传',
      '- read 之后内容如被后台反思任务改写，会被乐观锁拒绝并要求重新 read',
      '',
      '**什么时候调**：用户主动声明身份/强偏好/跨会话事实（"我叫 X"、"以后别叫我 Y"、"我是前端工程师"）',
      '',
      '**什么时候不调**：',
      '- 闲聊里偶尔出现的事实、本次任务进度、推断性"性格判断"、可立即重新发现的常识',
      '- 当前已有记忆已经覆盖该信息（避免重复写）',
      '- **用户对 SILI 自己人设/性格/语气的修改要求**（"说话别这么俏皮"、"用敬语"、"语气专业一点"等）——SILI 有鲜明的个人设定，这类要求一律不记，无论用户多坚决',
      '  - 区分点：改的是 SILI 自身 还是 SILI 怎么对待这个用户？后者算用户偏好（如"不喜欢被叫老板"、"别在群里 @ 我"），可以记',
      '',
      '**写之前自问**：这条信息一周后还有意义吗？下次对话能让我回得更好吗？答不上就跳过——空记忆比烂记忆好。',
      '',
      '**写法约定**（基于 read_user_memory 拿到的现有结构增改）：',
      '- 按 `## 主题` 分组（身份与偏好 / 跨会话事项 / 互动模式），一条一行 `- ...`',
      '- **声明性陈述，不要写命令**：✓「用户偏好简洁回复」 ✗「回复要简洁」（命令式条目会被未来轮当指令执行）',
      '- 时间敏感事项末尾标日期：`- ...（YYYY-MM-DD 写入）`，日期从最近的 `<chat_info>` 块取 current_time。长期不过期的偏好不用标',
      '',
      `硬上限 ${hardLimit} 字节（UTF-8），超出会被拒绝；空白内容（仅空格/换行）会被拒绝。`,
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
