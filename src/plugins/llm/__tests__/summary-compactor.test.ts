import { describe, expect, it, vi } from 'vitest'

import type {
  ChatMessage,
  LLMProviderBase,
  StreamChatDelta,
} from '../providers/_base'
import { SummaryCompactor } from '../services/summary-compactor'

/** Build the minimal mocked surface SummaryCompactor depends on. */
function mkDeps(over: {
  countUserMessages?: number
  history?: ChatMessage[]
  summary?: string | Error
}) {
  const createCalls: any[] = []
  const sessionsCreated: any[] = []
  const ctx = {
    database: {
      create: vi.fn(async (table: string, row: any) => {
        createCalls.push({ table, row })
        return row
      }),
    },
  } as any
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  } as any
  const history = {
    countUserMessages: vi.fn(async () => over.countUserMessages ?? 0),
    getById: vi.fn(async () => over.history ?? []),
  } as any
  const sessions = {
    create: vi.fn(async (input: any) => {
      sessionsCreated.push(input)
      return { id: 1, ...input }
    }),
  } as any
  const turns = {
    allocate: vi.fn(async () => 1),
  } as any

  const provider: LLMProviderBase = {
    async *streamChatCompletion(): AsyncGenerator<StreamChatDelta> {
      if (over.summary instanceof Error) {
        yield { kind: 'error', error: over.summary }
        return
      }
      if (typeof over.summary === 'string') {
        yield { kind: 'content', content: over.summary }
      }
      yield { kind: 'finish', reason: 'stop' }
    },
  } as any

  return { ctx, logger, history, sessions, turns, provider, createCalls, sessionsCreated }
}

const INPUT = {
  conversation_id: 'old-conv',
  conversation_owner: 42,
  systemPrompt: 'sys',
  model: 'gpt-test',
  platform: 'qq',
  userId: '999',
}

describe('SummaryCompactor', () => {
  it('returns ran=false when threshold is 0 (disabled)', async () => {
    const d = mkDeps({ countUserMessages: 100 })
    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 0 }
    )
    const r = await c.compactIfNeeded({ ...INPUT, provider: d.provider })
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('disabled')
    expect(d.history.countUserMessages).not.toHaveBeenCalled()
  })

  it('returns ran=false when user count is under threshold', async () => {
    const d = mkDeps({ countUserMessages: 5 })
    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 10 }
    )
    const r = await c.compactIfNeeded({ ...INPUT, provider: d.provider })
    expect(r.ran).toBe(false)
    expect(r.reason).toContain('under threshold')
    expect(d.history.getById).not.toHaveBeenCalled()
  })

  it('returns ran=false when history is empty (nothing to summarize)', async () => {
    const d = mkDeps({ countUserMessages: 50, history: [] })
    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 10 }
    )
    const r = await c.compactIfNeeded({ ...INPUT, provider: d.provider })
    expect(r.ran).toBe(false)
    expect(r.reason).toContain('no history')
  })

  it('returns ran=false when summary call yields empty text', async () => {
    const d = mkDeps({
      countUserMessages: 50,
      history: [{ role: 'user', content: 'hi' }],
      summary: '   ',
    })
    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 10 }
    )
    const r = await c.compactIfNeeded({ ...INPUT, provider: d.provider })
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('empty summary')
    expect(d.createCalls).toHaveLength(0)
  })

  it('returns ran=false when summary call errors', async () => {
    const d = mkDeps({
      countUserMessages: 50,
      history: [{ role: 'user', content: 'hi' }],
      summary: new Error('boom'),
    })
    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 10 }
    )
    const r = await c.compactIfNeeded({ ...INPUT, provider: d.provider })
    expect(r.ran).toBe(false)
    expect(r.reason).toContain('boom')
    expect(d.logger.warn).toHaveBeenCalled()
  })

  it('happy path: persists summary pair + new session, returns new id', async () => {
    const d = mkDeps({
      countUserMessages: 50,
      history: [
        { role: 'user', content: 'turn1' },
        { role: 'assistant', content: 'reply1' },
      ],
      summary: '我（SILI）和这位用户聊了 X 和 Y',
    })
    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 10 }
    )
    const r = await c.compactIfNeeded({ ...INPUT, provider: d.provider })

    expect(r.ran).toBe(true)
    expect(r.newConversationId).toBeTypeOf('string')
    expect(r.newConversationId).not.toBe('old-conv')
    expect(r.prevConversationId).toBe('old-conv')
    expect(r.summaryLength).toBeGreaterThan(0)

    // Two openai_chat rows: synthetic user prompt + assistant summary
    const chatRows = d.createCalls.filter((c) => c.table === 'openai_chat')
    expect(chatRows).toHaveLength(2)
    expect(chatRows[0].row).toMatchObject({
      role: 'user',
      conversation_id: r.newConversationId,
      turn_number: 1,
      intra_turn_seq: 0,
    })
    expect(chatRows[1].row).toMatchObject({
      role: 'assistant',
      conversation_id: r.newConversationId,
      turn_number: 1,
      intra_turn_seq: 1,
      content: '我（SILI）和这位用户聊了 X 和 Y',
      model: 'gpt-test',
    })

    // New session row links back via prev_session_id
    expect(d.sessionsCreated).toHaveLength(1)
    expect(d.sessionsCreated[0]).toMatchObject({
      conversationId: r.newConversationId,
      conversationOwner: 42,
      platform: 'qq',
      userId: '999',
      prevSessionId: 'old-conv',
    })
  })

  it('passes the summary call through provider with tools disabled', async () => {
    let receivedOptions: any
    const d = mkDeps({
      countUserMessages: 50,
      history: [{ role: 'user', content: 'hi' }],
    })
    d.provider.streamChatCompletion = (async function* (
      _msgs: any,
      opts: any
    ): AsyncGenerator<StreamChatDelta> {
      receivedOptions = opts
      yield { kind: 'content', content: 'summary' }
      yield { kind: 'finish', reason: 'stop' }
    }) as any

    const c = new SummaryCompactor(
      d.ctx,
      d.logger,
      d.history,
      d.sessions,
      d.turns,
      { threshold: 10, maxTokens: 999 }
    )
    await c.compactIfNeeded({ ...INPUT, provider: d.provider })

    expect(receivedOptions.tools).toEqual([])
    expect(receivedOptions.maxTokens).toBe(999)
    expect(receivedOptions.model).toBe('gpt-test')
    expect(receivedOptions.temperature).toBeLessThan(0.5)
  })
})
