import { tavily } from '@tavily/core'

import type {
  WebExtractClient,
  WebExtractResponse,
  WebSearchClient,
  WebSearchResponse,
} from '../tools'

export interface TavilyClientOptions {
  apiKey: string
  searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast'
  topic?: 'general' | 'news' | 'finance'
  /** Per-request timeout in seconds (Tavily SDK option). Default 15. */
  timeoutSeconds?: number
  /** Extract depth (`basic` is fast, `advanced` more thorough). Default basic. */
  extractDepth?: 'basic' | 'advanced'
}

type TavilyClient = ReturnType<typeof tavily>

/**
 * Thin adapter over `@tavily/core`. Implements both WebSearchClient and
 * WebExtractClient so the same SDK instance can back both `web_search`
 * and `extract_webpages` tools. The runners depend only on these
 * interfaces, not on Tavily directly.
 *
 * include_answer is left off — the agent has its own LLM and synthesizes
 * better than Tavily's answer endpoint, and skipping it shaves ~1-2s.
 */
export class TavilySearchClient implements WebSearchClient, WebExtractClient {
  private readonly client: TavilyClient
  private readonly searchDepth: TavilyClientOptions['searchDepth']
  private readonly topic: TavilyClientOptions['topic']
  private readonly timeoutSeconds: number
  private readonly extractDepth: 'basic' | 'advanced'

  constructor(options: TavilyClientOptions) {
    if (!options.apiKey) {
      throw new Error('TavilySearchClient: apiKey is required')
    }
    this.client = tavily({ apiKey: options.apiKey })
    this.searchDepth = options.searchDepth ?? 'basic'
    this.topic = options.topic ?? 'general'
    this.timeoutSeconds = options.timeoutSeconds ?? 15
    this.extractDepth = options.extractDepth ?? 'basic'
  }

  async search(input: {
    query: string
    maxResults: number
  }): Promise<WebSearchResponse> {
    const resp = await this.client.search(input.query, {
      searchDepth: this.searchDepth,
      topic: this.topic,
      maxResults: input.maxResults,
      includeAnswer: false,
      timeout: this.timeoutSeconds,
    })
    return {
      results: (resp.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: r.content ?? '',
        score: typeof r.score === 'number' ? r.score : undefined,
      })),
      answer: typeof resp.answer === 'string' ? resp.answer : undefined,
    }
  }

  async extract(urls: string[]): Promise<WebExtractResponse> {
    const resp = await this.client.extract(urls, {
      extractDepth: this.extractDepth,
      format: 'markdown',
      timeout: this.timeoutSeconds,
    })
    return {
      results: (resp.results ?? []).map((r) => ({
        url: r.url ?? '',
        title: typeof r.title === 'string' ? r.title : undefined,
        content: r.rawContent ?? '',
      })),
      failed: (resp.failedResults ?? []).map((f) => ({
        url: f.url ?? '',
        error: f.error ?? 'unknown error',
      })),
    }
  }
}
