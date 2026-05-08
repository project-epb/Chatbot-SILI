import { describe, it, expect } from 'vitest'
import {
  EXTRACT_WEBPAGES_TOOL,
  type MemoryToolState,
  ToolRegistry,
  WEB_SEARCH_TOOL,
  type WebExtractClient,
  type WebExtractResponse,
  type WebSearchClient,
  type WebSearchResponse,
  type WebToolsState,
  buildSaveUserMemoryTool,
  getMemoryToolState,
  getWebToolsState,
  isForbiddenAgentCommand,
  renderAgentHelp,
  runReadUserMemory,
  runSaveUserMemory,
  runWebExtract,
  runWebSearch,
  type ToolHandler,
} from '../tools'
import type { CommandCatalogEntry } from '../command-catalog'
import { byteLength } from '../memory'

const fakeHandler = (name: string, result = 'ok'): ToolHandler => ({
  definition: {
    name,
    description: `${name} desc`,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    return result
  },
})

describe('ToolRegistry', () => {
  it('starts empty', () => {
    const r = new ToolRegistry()
    expect(r.listDefinitions()).toEqual([])
    expect(r.get('foo')).toBeUndefined()
  })

  it('registers and retrieves a handler', () => {
    const r = new ToolRegistry()
    const h = fakeHandler('foo')
    r.register(h)
    expect(r.get('foo')).toBe(h)
    expect(r.listDefinitions()).toEqual([h.definition])
  })

  it('overwrites a handler with same name', () => {
    const r = new ToolRegistry()
    const a = fakeHandler('foo', 'a')
    const b = fakeHandler('foo', 'b')
    r.register(a)
    r.register(b)
    expect(r.get('foo')).toBe(b)
    expect(r.listDefinitions()).toHaveLength(1)
  })

  it('unregisters a handler', () => {
    const r = new ToolRegistry()
    r.register(fakeHandler('foo'))
    r.unregister('foo')
    expect(r.get('foo')).toBeUndefined()
    expect(r.listDefinitions()).toEqual([])
  })

  it('lists definitions in registration order', () => {
    const r = new ToolRegistry()
    r.register(fakeHandler('a'))
    r.register(fakeHandler('b'))
    r.register(fakeHandler('c'))
    expect(r.listDefinitions().map((d) => d.name)).toEqual(['a', 'b', 'c'])
  })
})

describe('isForbiddenAgentCommand', () => {
  it.each(['chat', 'llm', 'llm.reset', 'llm.memory', 'llm.catalog', 'llm.providers'])(
    'forbids %s',
    (name) => {
      expect(isForbiddenAgentCommand(name)).toBe(true)
    }
  )

  it.each(['pixiv.illust', 'homo', 'sticker', 'help', 'mediawiki', 'llmm', 'chat-history'])(
    'allows %s',
    (name) => {
      expect(isForbiddenAgentCommand(name)).toBe(false)
    }
  )

  it('does not match substrings (only prefix)', () => {
    expect(isForbiddenAgentCommand('foo.llm.bar')).toBe(false)
    expect(isForbiddenAgentCommand('not-llm.x')).toBe(false)
  })
})

describe('renderAgentHelp', () => {
  const catalog: CommandCatalogEntry[] = [
    {
      name: 'wiki',
      description: 'wiki cmd',
      args: [],
      options: [],
      aliases: [],
      children: [
        {
          name: 'wiki.connect',
          description: 'connect',
          args: [],
          options: [],
          aliases: [],
          children: [],
        },
      ],
    },
    {
      name: 'help',
      description: 'show help',
      args: [],
      options: [],
      aliases: [],
      children: [],
    },
  ]

  it('lists top-level commands when called without an arg', () => {
    const out = renderAgentHelp(catalog)
    expect(out).toContain('`wiki`')
    expect(out).toContain('`help`')
    // 不应该展开子命令
    expect(out).not.toContain('`wiki.connect`')
  })

  it('renders detail for a known top-level command', () => {
    const out = renderAgentHelp(catalog, 'wiki')
    expect(out).toContain('# wiki')
    expect(out).toContain('## 子指令')
    expect(out).toContain('`wiki.connect`')
  })

  it('renders detail for a nested command queried by full dot name', () => {
    const out = renderAgentHelp(catalog, 'wiki.connect')
    expect(out).toContain('# wiki.connect')
    expect(out).toContain('connect')
  })

  it('returns an error for unknown commands', () => {
    const out = renderAgentHelp(catalog, 'nope')
    expect(out).toMatch(/Error: command "nope" not found/)
  })

  it('returns placeholder when catalog is empty and no arg', () => {
    expect(renderAgentHelp([])).toBe('(暂无可用指令)')
  })
})

describe('runReadUserMemory', () => {
  const makeMemory = (
    table: Record<string, { content: string; last_updated_at: number }>
  ) => ({
    async getMeta(platform: string, userId: string) {
      const row = table[`${platform}/${userId}`]
      if (!row) return null
      return {
        id: 1,
        platform,
        user_id: userId,
        content: row.content,
        byte_size: byteLength(row.content),
        last_updated_at: row.last_updated_at,
        last_check_at: row.last_updated_at,
        update_count: 1,
        message_count_at_update: 0,
        last_forked_conversation_id: '',
      }
    },
  })

  it('returns the memory text when present', async () => {
    const memory = makeMemory({
      'qq/u1': { content: '- 喜欢吃热干面', last_updated_at: 100 },
    })
    const out = await runReadUserMemory(memory, 'qq', 'u1')
    expect(out.text).toBe('- 喜欢吃热干面')
    expect(out.lastUpdatedAt).toBe(100)
  })

  it('returns the placeholder when memory is empty string', async () => {
    const memory = makeMemory({
      'qq/u1': { content: '', last_updated_at: 0 },
    })
    const out = await runReadUserMemory(memory, 'qq', 'u1')
    expect(out.text).toBe('(暂无长期记忆)')
    expect(out.lastUpdatedAt).toBe(0)
  })

  it('returns the placeholder when memory is whitespace only', async () => {
    const memory = makeMemory({
      'qq/u1': { content: '   \n  \t ', last_updated_at: 50 },
    })
    const out = await runReadUserMemory(memory, 'qq', 'u1')
    expect(out.text).toBe('(暂无长期记忆)')
    // lastUpdatedAt 仍要返回，让乐观锁能识别"曾经有过 record"
    expect(out.lastUpdatedAt).toBe(50)
  })

  it('keys on (platform, userId) — no cross-user leak', async () => {
    const memory = makeMemory({
      'qq/u1': { content: 'mine', last_updated_at: 10 },
      'qq/u2': { content: 'theirs', last_updated_at: 20 },
    })
    expect((await runReadUserMemory(memory, 'qq', 'u1')).text).toBe('mine')
    expect((await runReadUserMemory(memory, 'qq', 'u2')).text).toBe('theirs')
    expect((await runReadUserMemory(memory, 'discord', 'u1')).text).toBe(
      '(暂无长期记忆)'
    )
  })

  it('appends usage stats when hardLimit is provided', async () => {
    const memory = makeMemory({
      'qq/u1': { content: '喜欢吃热干面', last_updated_at: 100 }, // 18 bytes UTF-8
    })
    const out = await runReadUserMemory(memory, 'qq', 'u1', {
      hardLimit: 3300,
    })
    expect(out.text).toMatch(/^喜欢吃热干面/)
    expect(out.text).toMatch(/已用 18 \/ 3300 字节/)
    expect(out.text).toMatch(/约 1% 配额/)
  })

  it('does not append usage stats for empty memory', async () => {
    const memory = makeMemory({
      'qq/u1': { content: '', last_updated_at: 0 },
    })
    const out = await runReadUserMemory(memory, 'qq', 'u1', {
      hardLimit: 3300,
    })
    expect(out.text).toBe('(暂无长期记忆)')
  })

  it('strips trailing whitespace from content before appending stats', async () => {
    const memory = makeMemory({
      'qq/u1': { content: 'a\n\n\n', last_updated_at: 1 },
    })
    const out = await runReadUserMemory(memory, 'qq', 'u1', {
      hardLimit: 100,
    })
    expect(out.text).toBe('a\n\n(已用 1 / 100 字节，约 1% 配额)')
  })
})

describe('runSaveUserMemory', () => {
  // Minimal in-memory store for getMeta + set
  const makeMemory = (initial?: { content: string; last_updated_at: number }) => {
    let row = initial
      ? {
          id: 1,
          platform: 'qq',
          user_id: 'u1',
          content: initial.content,
          byte_size: byteLength(initial.content),
          last_updated_at: initial.last_updated_at,
          last_check_at: initial.last_updated_at,
          update_count: 1,
          message_count_at_update: 0,
          last_forked_conversation_id: '',
        }
      : null
    const calls: Array<{
      content: string
      messageCount: number
      conversationId: string
    }> = []
    return {
      get current() {
        return row
      },
      calls,
      async getMeta() {
        return row
      },
      async set(
        _p: string,
        _u: string,
        content: string,
        messageCount: number,
        conversationId: string
      ) {
        calls.push({ content, messageCount, conversationId })
        row = {
          ...(row ?? {
            id: 1,
            platform: 'qq',
            user_id: 'u1',
            byte_size: 0,
            last_check_at: 0,
            update_count: 0,
            message_count_at_update: 0,
            last_forked_conversation_id: '',
          }),
          content,
          byte_size: byteLength(content),
          last_updated_at: row?.last_updated_at
            ? row.last_updated_at + 1
            : 1000,
          message_count_at_update: messageCount,
          last_forked_conversation_id: conversationId,
        } as any
      },
    }
  }

  const makeDeps = (memory: ReturnType<typeof makeMemory>, hardLimit = 3300) => ({
    memory,
    platform: 'qq',
    userId: 'u1',
    conversationId: 'conv1',
    getCurrentUserMessageCount: async () => 5,
    hardLimit,
  })

  const fresh = (
    overrides: Partial<MemoryToolState> = {}
  ): MemoryToolState => ({
    hasReadInTurn: false,
    lastSeenUpdatedAt: 0,
    savedThisTurn: false,
    ...overrides,
  })

  it('rejects when read_user_memory was not called first', async () => {
    const memory = makeMemory()
    const out = await runSaveUserMemory(
      { content: 'new' },
      fresh(),
      makeDeps(memory)
    )
    expect(out).toMatch(/^Error: please call read_user_memory first/)
    expect(memory.calls).toEqual([])
  })

  it('rejects when save was already called this turn', async () => {
    const memory = makeMemory()
    const out = await runSaveUserMemory(
      { content: 'new' },
      fresh({ hasReadInTurn: true, savedThisTurn: true }),
      makeDeps(memory)
    )
    expect(out).toMatch(/already been used/)
    expect(memory.calls).toEqual([])
  })

  it('rejects empty / whitespace content', async () => {
    const memory = makeMemory()
    const a = await runSaveUserMemory(
      { content: '' },
      fresh({ hasReadInTurn: true }),
      makeDeps(memory)
    )
    expect(a).toMatch(/empty or whitespace/)

    const b = await runSaveUserMemory(
      { content: '   \n\t  ' },
      fresh({ hasReadInTurn: true }),
      makeDeps(memory)
    )
    expect(b).toMatch(/empty or whitespace/)
    expect(memory.calls).toEqual([])
  })

  it('rejects content exceeding hard limit', async () => {
    const memory = makeMemory()
    const long = 'x'.repeat(4000)
    const out = await runSaveUserMemory(
      { content: long },
      fresh({ hasReadInTurn: true }),
      makeDeps(memory, 3300)
    )
    expect(out).toMatch(/exceeds hard limit 3300/)
    expect(memory.calls).toEqual([])
  })

  it('rejects when memory was modified after read (optimistic lock)', async () => {
    const memory = makeMemory({ content: 'old', last_updated_at: 200 })
    const state = fresh({ hasReadInTurn: true, lastSeenUpdatedAt: 100 })
    const out = await runSaveUserMemory(
      { content: 'new' },
      state,
      makeDeps(memory)
    )
    expect(out).toMatch(/modified after your last read/)
    expect(memory.calls).toEqual([])
    // lock failure should also force re-read
    expect(state.hasReadInTurn).toBe(false)
    expect(state.lastSeenUpdatedAt).toBe(0)
  })

  it('commits and marks state.savedThisTurn=true on success', async () => {
    const memory = makeMemory({ content: 'old', last_updated_at: 100 })
    const state = fresh({ hasReadInTurn: true, lastSeenUpdatedAt: 100 })
    const out = await runSaveUserMemory(
      { content: 'fresh content' },
      state,
      makeDeps(memory)
    )
    expect(out).toMatch(/^OK: memory updated \(\d+ bytes\)\.$/)
    expect(memory.calls).toEqual([
      { content: 'fresh content', messageCount: 5, conversationId: 'conv1' },
    ])
    expect(state.savedThisTurn).toBe(true)
  })

  it('first-time save (no prior memory) works when state.lastSeenUpdatedAt=0', async () => {
    const memory = makeMemory() // no row yet
    const state = fresh({ hasReadInTurn: true, lastSeenUpdatedAt: 0 })
    const out = await runSaveUserMemory(
      { content: 'first entry' },
      state,
      makeDeps(memory)
    )
    expect(out).toMatch(/^OK: memory updated/)
    expect(memory.calls).toHaveLength(1)
    expect(state.savedThisTurn).toBe(true)
  })

  it('rejects malformed input', async () => {
    const memory = makeMemory()
    const out = await runSaveUserMemory(
      undefined,
      fresh({ hasReadInTurn: true }),
      makeDeps(memory)
    )
    expect(out).toMatch(/missing required field/)
  })
})

describe('getMemoryToolState', () => {
  it('initializes default state on first access and shares across calls', () => {
    const ts: Record<string, unknown> = {}
    const a = getMemoryToolState(ts)
    expect(a).toEqual({
      hasReadInTurn: false,
      lastSeenUpdatedAt: 0,
      savedThisTurn: false,
    })
    a.hasReadInTurn = true
    const b = getMemoryToolState(ts)
    expect(b).toBe(a)
    expect(b.hasReadInTurn).toBe(true)
  })
})

describe('runWebSearch', () => {
  const makeClient = (resp: WebSearchResponse): WebSearchClient => ({
    async search() {
      return resp
    },
  })

  const failingClient = (msg = 'boom'): WebSearchClient => ({
    async search() {
      throw new Error(msg)
    },
  })

  const freshState = (
    overrides: Partial<WebToolsState> = {}
  ): WebToolsState => ({
    searchCallCount: 0,
    extractCallCount: 0,
    ...overrides,
  })

  const sampleResults: WebSearchResponse = {
    results: [
      {
        title: 'Example One',
        url: 'https://example.com/a',
        content: 'first snippet',
        score: 0.9,
      },
      {
        title: 'Example Two',
        url: 'https://example.com/b',
        content: 'second snippet',
      },
    ],
  }

  it('rejects empty / missing query without burning the budget', async () => {
    const c = makeClient(sampleResults)
    const state = freshState()
    expect(await runWebSearch(undefined, c, state)).toMatch(
      /missing required field/
    )
    expect(await runWebSearch({ query: '' }, c, state)).toMatch(
      /missing required/
    )
    expect(await runWebSearch({ query: '   \n  ' }, c, state)).toMatch(
      /missing required/
    )
    expect(state.searchCallCount).toBe(0)
  })

  it('formats results with title, URL and content', async () => {
    const out = await runWebSearch(
      { query: 'foo' },
      makeClient(sampleResults),
      freshState()
    )
    expect(out).toContain('# 搜索结果："foo"')
    expect(out).toContain('## 1. Example One')
    expect(out).toContain('URL: https://example.com/a')
    expect(out).toContain('first snippet')
    expect(out).toContain('## 2. Example Two')
    expect(out).toContain('URL: https://example.com/b')
    expect(out).toContain('second snippet')
  })

  it('includes the engine answer when provided', async () => {
    const out = await runWebSearch(
      { query: 'foo' },
      makeClient({ ...sampleResults, answer: 'short summary' }),
      freshState()
    )
    expect(out).toContain('**摘要**：short summary')
  })

  it('handles empty results gracefully and still increments call count', async () => {
    const state = freshState()
    const out = await runWebSearch(
      { query: 'no hits' },
      makeClient({ results: [] }),
      state
    )
    expect(out).toMatch(/没有搜到.*"no hits"/)
    expect(state.searchCallCount).toBe(1)
  })

  it('returns Error string when client throws (still increments)', async () => {
    const state = freshState()
    const out = await runWebSearch(
      { query: 'foo' },
      failingClient('network down'),
      state
    )
    expect(out).toMatch(/^Error: web search failed: network down/)
    expect(state.searchCallCount).toBe(1)
  })

  it('clamps max_results to the configured cap', async () => {
    let received = 0
    const client: WebSearchClient = {
      async search(input) {
        received = input.maxResults
        return { results: [] }
      },
    }
    await runWebSearch({ query: 'q', max_results: 999 }, client, freshState(), {
      maxResultsCap: 10,
    })
    expect(received).toBe(10)
  })

  it('falls back to defaultMaxResults when not provided / invalid', async () => {
    let received = 0
    const client: WebSearchClient = {
      async search(input) {
        received = input.maxResults
        return { results: [] }
      },
    }
    await runWebSearch({ query: 'q' }, client, freshState(), {
      defaultMaxResults: 7,
    })
    expect(received).toBe(7)
    await runWebSearch({ query: 'q', max_results: 0 }, client, freshState(), {
      defaultMaxResults: 7,
    })
    expect(received).toBe(7)
    await runWebSearch(
      { query: 'q', max_results: Number.NaN as any },
      client,
      freshState(),
      { defaultMaxResults: 7 }
    )
    expect(received).toBe(7)
  })

  it('honors a valid in-range max_results', async () => {
    let received = 0
    const client: WebSearchClient = {
      async search(input) {
        received = input.maxResults
        return { results: [] }
      },
    }
    await runWebSearch({ query: 'q', max_results: 3 }, client, freshState(), {
      defaultMaxResults: 5,
      maxResultsCap: 10,
    })
    expect(received).toBe(3)
  })

  it('trims the query before passing to the client', async () => {
    let received = ''
    const client: WebSearchClient = {
      async search(input) {
        received = input.query
        return { results: [] }
      },
    }
    await runWebSearch({ query: '  hello world  ' }, client, freshState())
    expect(received).toBe('hello world')
  })

  it('rejects further calls past the per-turn cap', async () => {
    const state = freshState({ searchCallCount: 3 })
    let calls = 0
    const client: WebSearchClient = {
      async search() {
        calls++
        return { results: [] }
      },
    }
    const out = await runWebSearch({ query: 'q' }, client, state, {
      maxCallsPerTurn: 3,
    })
    expect(out).toMatch(/已经调用 3 次.*上限 3/)
    expect(calls).toBe(0) // didn't hit the API
    expect(state.searchCallCount).toBe(3) // didn't increment past the cap either
  })

  it('lets a fresh-state agent reach the cap exactly', async () => {
    const state = freshState()
    const client = makeClient(sampleResults)
    for (let i = 0; i < 3; i++) {
      const out = await runWebSearch({ query: `q${i}` }, client, state, {
        maxCallsPerTurn: 3,
      })
      expect(out).not.toMatch(/^Error/)
    }
    expect(state.searchCallCount).toBe(3)
    const out = await runWebSearch({ query: 'q4' }, client, state, {
      maxCallsPerTurn: 3,
    })
    expect(out).toMatch(/^Error: web_search/)
  })

  it('appends remaining-budget hint when below cap', async () => {
    const state = freshState()
    const out = await runWebSearch(
      { query: 'q' },
      makeClient(sampleResults),
      state,
      { maxCallsPerTurn: 3 }
    )
    expect(out).toMatch(/本轮还可再 search 2 次/)
  })

  it('appends quota-used-up hint at last allowed call', async () => {
    const state = freshState({ searchCallCount: 2 })
    const out = await runWebSearch(
      { query: 'q' },
      makeClient(sampleResults),
      state,
      { maxCallsPerTurn: 3 }
    )
    expect(out).toMatch(/本轮 search 配额已用完/)
  })
})

describe('WEB_SEARCH_TOOL definition', () => {
  it('declares query as required and constrains max_results', () => {
    expect(WEB_SEARCH_TOOL.name).toBe('web_search')
    expect(WEB_SEARCH_TOOL.parameters.required).toEqual(['query'])
    const props = WEB_SEARCH_TOOL.parameters.properties
    expect(props.query.type).toBe('string')
    expect(props.max_results.type).toBe('integer')
    expect(props.max_results.minimum).toBe(1)
    expect(props.max_results.maximum).toBe(10)
  })

  it('teaches when to use vs not use, and points to extract_webpages', () => {
    expect(WEB_SEARCH_TOOL.description).toMatch(/什么时候调|什么时候不调|什么时候别调/)
    expect(WEB_SEARCH_TOOL.description).toMatch(/execute_koishi_command/)
    expect(WEB_SEARCH_TOOL.description).toMatch(/extract_webpages/)
    expect(WEB_SEARCH_TOOL.description).toMatch(/3 次/)
  })
})

describe('runWebExtract', () => {
  const sampleResp: WebExtractResponse = {
    results: [
      {
        url: 'https://example.com/a',
        title: 'Page A',
        content: 'page A body',
      },
      {
        url: 'https://example.com/b',
        content: 'page B body',
      },
    ],
    failed: [{ url: 'https://example.com/dead', error: '404' }],
  }

  const makeClient = (resp: WebExtractResponse): WebExtractClient => ({
    async extract() {
      return resp
    },
  })

  const freshState = (
    overrides: Partial<WebToolsState> = {}
  ): WebToolsState => ({
    searchCallCount: 0,
    extractCallCount: 0,
    ...overrides,
  })

  it('rejects missing / non-array urls', async () => {
    const c = makeClient(sampleResp)
    expect(await runWebExtract(undefined, c, freshState())).toMatch(
      /missing required field "urls"/
    )
    expect(
      await runWebExtract({ urls: 'not-array' as any }, c, freshState())
    ).toMatch(/missing required field "urls"/)
  })

  it('rejects empty / all-blank urls array', async () => {
    const c = makeClient(sampleResp)
    expect(await runWebExtract({ urls: [] }, c, freshState())).toMatch(
      /empty after trimming/
    )
    expect(
      await runWebExtract({ urls: ['', '  ', '\n'] }, c, freshState())
    ).toMatch(/empty after trimming/)
  })

  it('rejects too many URLs', async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`)
    const out = await runWebExtract({ urls }, makeClient(sampleResp), freshState(), {
      maxUrlsPerCall: 5,
    })
    expect(out).toMatch(/too many URLs.*cap is 5/)
  })

  it('formats successful results + failed urls together', async () => {
    const out = await runWebExtract(
      { urls: ['https://example.com/a', 'https://example.com/b'] },
      makeClient(sampleResp),
      freshState()
    )
    expect(out).toContain('## 1. Page A')
    expect(out).toContain('URL: https://example.com/a')
    expect(out).toContain('page A body')
    expect(out).toContain('## 2. https://example.com/b')
    expect(out).toContain('page B body')
    expect(out).toContain('## 抓取失败的 URL')
    expect(out).toContain('https://example.com/dead — 404')
  })

  it('returns Error string when client throws (still increments)', async () => {
    const state = freshState()
    const client: WebExtractClient = {
      async extract() {
        throw new Error('rate limit')
      },
    }
    const out = await runWebExtract(
      { urls: ['https://example.com/a'] },
      client,
      state
    )
    expect(out).toMatch(/^Error: web extract failed: rate limit/)
    expect(state.extractCallCount).toBe(1)
  })

  it('rejects further calls past the per-turn cap', async () => {
    const state = freshState({ extractCallCount: 2 })
    let calls = 0
    const client: WebExtractClient = {
      async extract() {
        calls++
        return { results: [], failed: [] }
      },
    }
    const out = await runWebExtract(
      { urls: ['https://example.com/a'] },
      client,
      state,
      { maxCallsPerTurn: 2 }
    )
    expect(out).toMatch(/已经调用 2 次.*上限 2/)
    expect(calls).toBe(0)
    expect(state.extractCallCount).toBe(2)
  })

  it('trims and filters non-string entries before sending', async () => {
    let received: string[] = []
    const client: WebExtractClient = {
      async extract(urls) {
        received = urls
        return { results: [], failed: [] }
      },
    }
    await runWebExtract(
      { urls: ['  https://x.com  ', 42 as any, '', 'https://y.com'] },
      client,
      freshState()
    )
    expect(received).toEqual(['https://x.com', 'https://y.com'])
  })
})

describe('EXTRACT_WEBPAGES_TOOL definition', () => {
  it('requires urls and constrains array size', () => {
    expect(EXTRACT_WEBPAGES_TOOL.name).toBe('extract_webpages')
    expect(EXTRACT_WEBPAGES_TOOL.parameters.required).toEqual(['urls'])
    const urls = EXTRACT_WEBPAGES_TOOL.parameters.properties.urls
    expect(urls.type).toBe('array')
    expect(urls.minItems).toBe(1)
    expect(urls.maxItems).toBe(5)
  })

  it('teaches batch usage and per-turn cap', () => {
    expect(EXTRACT_WEBPAGES_TOOL.description).toMatch(/一次调用|batch|一次性/)
    expect(EXTRACT_WEBPAGES_TOOL.description).toMatch(/2 次|最多 2/)
    expect(EXTRACT_WEBPAGES_TOOL.description).toMatch(/web_search/)
  })
})

describe('getWebToolsState', () => {
  it('initializes counts to zero on first access and shares thereafter', () => {
    const ts: Record<string, unknown> = {}
    const a = getWebToolsState(ts)
    expect(a).toEqual({ searchCallCount: 0, extractCallCount: 0 })
    a.searchCallCount = 2
    const b = getWebToolsState(ts)
    expect(b).toBe(a)
    expect(b.searchCallCount).toBe(2)
  })
})

describe('buildSaveUserMemoryTool', () => {
  it('bakes hardLimit into description', () => {
    const def = buildSaveUserMemoryTool(3300)
    expect(def.name).toBe('save_user_memory')
    expect(def.description).toContain('3300 字节')
    expect(def.description).toContain('read_user_memory')
  })

  it('teaches declarative-not-imperative phrasing', () => {
    const def = buildSaveUserMemoryTool(3300)
    expect(def.description).toMatch(/声明性|不要写命令/)
  })

  it('forbids recording user requests to alter SILI persona', () => {
    const def = buildSaveUserMemoryTool(3300)
    expect(def.description).toMatch(/SILI.*人设|SILI 自[己身]|个人设定/)
  })

  it('mentions date-stamping for time-sensitive entries', () => {
    const def = buildSaveUserMemoryTool(3300)
    expect(def.description).toMatch(/YYYY-MM-DD|chat_info|current_time/)
  })
})
