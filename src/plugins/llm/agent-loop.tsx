import { Context, Logger, Session } from 'koishi'

import { LLMProviderBase } from './providers/_base'
import type {
  ChatCompletionFeatures,
  ChatCompletionOptions,
  ChatCompletionUsage,
  ChatMessage,
  ToolCall,
} from './providers/_base'
import { ToolRegistry } from './tools'

export interface AgentLoopOptions {
  ctx: Context
  provider: LLMProviderBase
  messages: ChatMessage[]                   // 包含 system，会被复制
  options: ChatCompletionOptions             // 含 tools
  features?: ChatCompletionFeatures
  registry: ToolRegistry                    // 工具注册表
  maxIterations: number
  showToolCallNotice: boolean
  session: Session
  logger: Logger
  onUserVisibleText: (text: string) => Promise<void>
  onAssistantRecord: (record: AssistantTurnRecord) => Promise<void>
  onToolRecord: (record: ToolTurnRecord) => Promise<void>
  /**
   * Called after each iteration's stream finishes consuming. Lets the
   * caller force-flush any buffered visible text before tool execution
   * starts, so the model's pre-tool "let me check..." line surfaces as
   * its own message instead of getting concatenated with later turns'
   * text into one wall.
   */
  onTurnEnd?: (info: { hadToolCalls: boolean }) => Promise<void>
}

export interface AssistantTurnRecord {
  content: string
  reasoningContent: string
  toolCalls?: ToolCall[]
  usage?: ChatCompletionUsage
  model: string
  time: number
}

export interface ToolTurnRecord {
  toolCallId: string
  toolName: string
  content: string
  time: number
}

export interface AgentLoopResult {
  fullContent: string
  totalUsage?: ChatCompletionUsage
  iterations: number
}

export async function runAgentLoop(
  opts: AgentLoopOptions
): Promise<AgentLoopResult> {
  const messages = [...opts.messages]
  let iterations = 0
  let lastFullContent = ''
  let totalUsage: ChatCompletionUsage | undefined

  const allTools = opts.registry.listDefinitions()

  while (iterations < opts.maxIterations) {
    iterations++
    const isLastAllowed = iterations >= opts.maxIterations

    const callOptions: ChatCompletionOptions = {
      ...opts.options,
      tools: isLastAllowed || allTools.length === 0 ? undefined : allTools,
      toolChoice: isLastAllowed ? undefined : opts.options.toolChoice ?? 'auto',
    }

    const stream = opts.provider.streamChatCompletion(
      messages,
      callOptions,
      opts.features
    )

    let currentContent = ''
    let currentReasoning = ''
    const collectedToolCalls: ToolCall[] = []
    let lastError: Error | undefined
    let usage: ChatCompletionUsage | undefined

    for await (const delta of stream) {
      switch (delta.kind) {
        case 'reasoning_content':
          currentReasoning += delta.content
          break
        case 'content':
          currentContent += delta.content
          await opts.onUserVisibleText(delta.content)
          break
        case 'tool_call':
          collectedToolCalls.push(delta.toolCall)
          break
        case 'usage':
          usage = delta.usage
          break
        case 'error':
          lastError = delta.error
          break
        case 'finish':
          break
      }
    }

    if (lastError) throw lastError

    if (usage) {
      totalUsage = mergeUsage(totalUsage, usage)
    }

    // 持久化 assistant 这一轮的记录
    await opts.onAssistantRecord({
      content: currentContent,
      reasoningContent: currentReasoning,
      toolCalls: collectedToolCalls.length ? collectedToolCalls : undefined,
      usage,
      model: opts.options.model,
      time: Date.now(),
    })

    // 让 caller 把这一轮的可见文本作为独立消息发出，避免和后续轮次拼成一坨
    await opts.onTurnEnd?.({ hadToolCalls: collectedToolCalls.length > 0 })

    if (collectedToolCalls.length === 0) {
      lastFullContent = currentContent
      break
    }

    // 把 assistant(tool_calls) 加入下一轮的消息历史
    messages.push({
      role: 'assistant',
      content: currentContent,
      tool_calls: collectedToolCalls,
    })

    // 串行执行所有工具
    for (const tc of collectedToolCalls) {
      if (opts.showToolCallNotice) {
        // tc.name 是 LLM 工具名（execute_koishi_command），对用户没意义；
        // 显示真实 koishi 命令名（tc.arguments.name）更友好。
        const args = tc.arguments as any
        const displayName =
          tc.name === 'execute_koishi_command' && args?.name
            ? args.name
            : tc.name
        await opts.session
          .send(<>[正在执行: {displayName}]</>)
          .catch(() => {})
      }
      opts.logger.info('[agent] tool call:', tc.name, tc.arguments)
      const resultText = await dispatchTool(opts, tc)
      opts.logger.info(
        '[agent] tool result:',
        tc.name,
        resultText.slice(0, 200)
      )
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        tool_name: tc.name,
        content: resultText,
      })
      await opts.onToolRecord({
        toolCallId: tc.id,
        toolName: tc.name,
        content: resultText,
        time: Date.now(),
      })
    }
    lastFullContent = currentContent
  }

  return {
    fullContent: lastFullContent,
    totalUsage,
    iterations,
  }
}

async function dispatchTool(
  opts: AgentLoopOptions,
  tc: ToolCall
): Promise<string> {
  const handler = opts.registry.get(tc.name)
  if (!handler) return `Error: unknown tool "${tc.name}"`
  try {
    return await handler.execute(tc.arguments, {
      ctx: opts.ctx,
      logger: opts.logger,
      session: opts.session,
    })
  } catch (e: any) {
    return `Error: ${e?.message || String(e)}`
  }
}

function mergeUsage(
  a: ChatCompletionUsage | undefined,
  b: ChatCompletionUsage
): ChatCompletionUsage {
  if (!a) return b
  return {
    promptTokens: (a.promptTokens ?? 0) + (b.promptTokens ?? 0),
    completionTokens: (a.completionTokens ?? 0) + (b.completionTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
  }
}
