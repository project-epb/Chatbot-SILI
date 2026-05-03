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

/** Magic string the agent emits to choose silence (typically when the user
 *  said "shut up" / "stop talking"). Stream output is suppressed and the
 *  whole turn is dropped from history (see runAgentLoop result.silentChosen). */
const SILENT_MARKER = '<silent/>'
/** Appended to assistant content when the turn was cut short by user
 *  interrupt. Lets the model read history and understand "I was talking,
 *  user cut me off". */
const INTERRUPTED_MARKER = '<interrupted/>'

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
  /** Optional signal to interrupt mid-loop. Aborts the in-flight LLM stream,
   *  bails out of subsequent iterations, and skews input/output bookkeeping
   *  so partial assistant text is preserved with an `<interrupted/>` marker. */
  signal?: AbortSignal
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
  /** True if the loop bailed because of opts.signal.aborted. */
  aborted: boolean
  /** True if the agent emitted SILENT_MARKER as its full response — caller
   *  should suppress UI output AND skip writing this turn's user message. */
  silentChosen: boolean
}

export async function runAgentLoop(
  opts: AgentLoopOptions
): Promise<AgentLoopResult> {
  const messages = [...opts.messages]
  let iterations = 0
  let lastFullContent = ''
  let totalUsage: ChatCompletionUsage | undefined
  let silentChosen = false

  const allTools = opts.registry.listDefinitions()
  const isAborted = () => opts.signal?.aborted === true

  outer: while (iterations < opts.maxIterations) {
    if (isAborted()) break
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
      { ...opts.features, signal: opts.signal }
    )

    let currentContent = ''
    let currentReasoning = ''
    const collectedToolCalls: ToolCall[] = []
    let lastError: Error | undefined
    let usage: ChatCompletionUsage | undefined
    let streamAborted = false

    try {
      for await (const delta of stream) {
        if (isAborted()) {
          streamAborted = true
          break
        }
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
    } catch (e: any) {
      // SDKs throw AbortError when the upstream signal fires — treat as
      // graceful interrupt rather than a failure to surface.
      if (isAborted() || e?.name === 'AbortError') {
        streamAborted = true
      } else {
        throw e
      }
    }

    if (lastError && !streamAborted) throw lastError

    if (usage) totalUsage = mergeUsage(totalUsage, usage)

    // ---- Stream-level abort: bail before considering tool calls ----
    if (streamAborted) {
      if (currentContent) {
        await opts.onAssistantRecord({
          content: currentContent + '\n' + INTERRUPTED_MARKER,
          reasoningContent: currentReasoning,
          toolCalls: undefined,
          usage,
          model: opts.options.model,
          time: Date.now(),
        })
      }
      lastFullContent = currentContent
      break
    }

    // ---- SILENT marker: agent chose to stay quiet ----
    // Skip persistence so history doesn't carry this non-conversation; the
    // caller will also drop the current user message.
    if (currentContent.trim() === SILENT_MARKER) {
      silentChosen = true
      lastFullContent = ''
      break
    }

    // ---- No tool calls: normal terminal turn ----
    if (collectedToolCalls.length === 0) {
      await opts.onAssistantRecord({
        content: currentContent,
        reasoningContent: currentReasoning,
        toolCalls: undefined,
        usage,
        model: opts.options.model,
        time: Date.now(),
      })
      await opts.onTurnEnd?.({ hadToolCalls: false })
      lastFullContent = currentContent
      break
    }

    // ---- Tool calls present ----
    // Defer assistant record persistence until we know whether the tools
    // complete: if abort fires during tool execution we want to write the
    // turn as `<interrupted/>` (no tool_calls) so history stays well-formed.
    await opts.onTurnEnd?.({ hadToolCalls: true })

    // Push assistant turn to in-memory messages so subsequent tool messages
    // form a valid OpenAI/Anthropic conversation when we DO continue.
    messages.push({
      role: 'assistant',
      content: currentContent,
      tool_calls: collectedToolCalls,
    })

    const completedToolMessages: Array<{
      tc: ToolCall
      resultText: string
      time: number
    }> = []

    for (const tc of collectedToolCalls) {
      if (isAborted()) {
        // Don't even start more tools after abort.
        break
      }
      if (opts.showToolCallNotice) {
        // tc.name is the LLM tool name (execute_koishi_command), opaque to
        // users; show the real koishi command name from arguments instead.
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
      // Check abort AFTER tool finishes. We can't cancel a running koishi
      // command — let it finish, then drop the result if user has moved on.
      if (isAborted()) break
      completedToolMessages.push({
        tc,
        resultText,
        time: Date.now(),
      })
    }

    if (isAborted()) {
      // Tool round-trip didn't complete cleanly. Persist assistant as
      // interrupted (no tool_calls field) and drop the partial tool
      // results. History stays well-formed: user → assistant<interrupted/>.
      if (currentContent) {
        await opts.onAssistantRecord({
          content: currentContent + '\n' + INTERRUPTED_MARKER,
          reasoningContent: currentReasoning,
          toolCalls: undefined,
          usage,
          model: opts.options.model,
          time: Date.now(),
        })
      }
      lastFullContent = currentContent
      break outer
    }

    // ---- All tools finished cleanly; persist the full turn ----
    await opts.onAssistantRecord({
      content: currentContent,
      reasoningContent: currentReasoning,
      toolCalls: collectedToolCalls,
      usage,
      model: opts.options.model,
      time: Date.now(),
    })
    for (const m of completedToolMessages) {
      messages.push({
        role: 'tool',
        tool_call_id: m.tc.id,
        tool_name: m.tc.name,
        content: m.resultText,
      })
      await opts.onToolRecord({
        toolCallId: m.tc.id,
        toolName: m.tc.name,
        content: m.resultText,
        time: m.time,
      })
    }
    lastFullContent = currentContent
  }

  return {
    fullContent: lastFullContent,
    totalUsage,
    iterations,
    aborted: isAborted(),
    silentChosen,
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
