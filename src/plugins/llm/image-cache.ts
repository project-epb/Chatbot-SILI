import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface ImageReferenceCacheOptions {
  /** Absolute directory for cached image files. Created lazily on first write. */
  dir: string
  /** Files older than this (by mtime) are deleted on cleanup. Default 4h. */
  ttlMs?: number
  /** Total disk usage cap; cleanup deletes oldest first until under cap. Default 500MB. */
  maxBytes?: number
  /**
   * Per-image size limit (in bytes of the base64 dataUri string). Images
   * larger than this are NOT cached and get replaced by a placeholder in
   * the agent's view — protects against (a) sync md5 blocking the event
   * loop and (b) one giant tool result blowing past the LLM context limit.
   * Default 8MB.
   */
  maxImageBytes?: number
}

/**
 * Disk-backed cache mapping inline image data URIs (`data:image/...;base64,...`)
 * to short, stable reference IDs. Lets the agent see a compact `<img ref="..."/>`
 * placeholder instead of paying token for the full base64.
 *
 * The mapping is deterministic (md5 prefix) — same data URI always gets the
 * same ID, so the same image dedupes naturally across turns.
 *
 * Storage: `<dir>/<id>.b64`, content is the data URI verbatim. mtime is
 * touched on every register/resolve hit to act as an LRU clock; cleanup uses
 * mtime for both TTL and overflow eviction.
 */
export class ImageReferenceCache {
  private readonly dir: string
  private readonly ttlMs: number
  private readonly maxBytes: number
  private readonly maxImageBytes: number
  // Memoize the mkdir promise so concurrent register() calls don't race.
  private dirReady: Promise<void> | null = null

  constructor(opts: ImageReferenceCacheOptions) {
    this.dir = opts.dir
    this.ttlMs = opts.ttlMs ?? 4 * 60 * 60 * 1000
    this.maxBytes = opts.maxBytes ?? 500 * 1024 * 1024
    this.maxImageBytes = opts.maxImageBytes ?? 8 * 1024 * 1024
  }

  /** 12-char md5 prefix is collision-safe enough for a few hundred items. */
  private idOf(dataUri: string): string {
    return crypto.createHash('md5').update(dataUri).digest('hex').slice(0, 12)
  }

  private pathFor(id: string): string {
    return path.join(this.dir, `${id}.b64`)
  }

  private ensureDir(): Promise<void> {
    if (!this.dirReady) {
      this.dirReady = fs.mkdir(this.dir, { recursive: true }).then(() => {})
    }
    return this.dirReady
  }

  /**
   * Register a data URI; returns the short id. Idempotent: same URI always
   * yields the same id. If the file already exists, just bumps mtime
   * (cheaper than rewriting). Best-effort on errors — failure here means
   * the caller falls back to the raw base64 (token-expensive but correct).
   */
  async register(dataUri: string): Promise<string> {
    const id = this.idOf(dataUri)
    const filepath = this.pathFor(id)
    try {
      await this.ensureDir()
      const exists = await fs
        .stat(filepath)
        .then(() => true)
        .catch(() => false)
      const now = new Date()
      if (exists) {
        await fs.utimes(filepath, now, now)
      } else {
        await fs.writeFile(filepath, dataUri)
      }
    } catch {
      // best-effort
    }
    return id
  }

  /**
   * Resolve an id back to its original data URI. Touches mtime on hit so
   * actively-used images keep their place. Returns undefined on miss
   * (file deleted by cleanup or never registered) — callers should drop
   * the `<img ref/>` element rather than emit something broken.
   */
  async resolve(id: string): Promise<string | undefined> {
    const filepath = this.pathFor(id)
    try {
      const data = await fs.readFile(filepath, 'utf8')
      const now = new Date()
      // fire-and-forget touch — don't block resolve on it
      fs.utimes(filepath, now, now).catch(() => {})
      return data
    } catch {
      return undefined
    }
  }

  /**
   * Replace every `<img ... src="data:..." ... />` in `text` with
   * `<img ... ref="<id>" ... />`. Other src values (http urls etc.) are
   * left alone — only `data:` URIs are token-expensive enough to warrant
   * the indirection.
   *
   * Oversized images (`maxImageBytes`) are replaced by a `[图片过大已省略]`
   * placeholder instead of caching — keeps a single huge image from
   * blocking the event loop on md5 OR blowing past the LLM context.
   */
  async replaceDataUrisWithRefs(text: string): Promise<string> {
    if (!text || text.indexOf('data:') < 0) return text
    const re = /<img\b([^>]*?)\bsrc="(data:[^"]+)"([^>]*?)\/?>/gi
    const matches = [...text.matchAll(re)]
    if (matches.length === 0) return text
    const results = await Promise.all(
      matches.map(async (m) => {
        const dataUri = m[2]
        if (dataUri.length > this.maxImageBytes) return null
        return await this.register(dataUri)
      })
    )
    let i = 0
    return text.replace(re, (_full, pre, _data, post) => {
      const id = results[i++]
      if (id === null) return '[图片过大已省略]'
      return `<img${pre}ref="${id}"${post}/>`
    })
  }

  /**
   * Inverse of `replaceDataUrisWithRefs`: turn `<img ref="..."/>` back into
   * `<img src="data:..."/>`. Refs whose files have been cleaned up (or
   * never existed) are dropped so they don't leak as broken markup.
   */
  async resolveRefsToDataUris(text: string): Promise<string> {
    if (!text || text.indexOf('ref="') < 0) return text
    const re = /<img\b([^>]*?)\bref="([a-f0-9]+)"([^>]*?)\/?>/gi
    const matches = [...text.matchAll(re)]
    if (matches.length === 0) return text
    const datas = await Promise.all(matches.map((m) => this.resolve(m[2])))
    let i = 0
    return text.replace(re, (_full, pre, _id, post) => {
      const d = datas[i++]
      if (!d) return ''
      return `<img${pre}src="${d}"${post}/>`
    })
  }

  /**
   * Sweep the cache directory:
   *  - delete files older than ttlMs (by mtime)
   *  - if remaining total size > maxBytes, delete oldest first until under
   *
   * Returns counters useful for logging. Best-effort: missing dir, race
   * with concurrent unlink, etc. just decrement what they can.
   */
  async cleanup(): Promise<{
    removed: number
    kept: number
    totalBytes: number
  }> {
    type Entry = { name: string; mtime: number; size: number }
    let removed = 0
    try {
      await this.ensureDir()
      const names = await fs.readdir(this.dir)
      const now = Date.now()
      const fresh: Entry[] = []
      for (const name of names) {
        if (!name.endsWith('.b64')) continue
        const fp = path.join(this.dir, name)
        try {
          const st = await fs.stat(fp)
          if (now - st.mtimeMs > this.ttlMs) {
            await fs.unlink(fp).catch(() => {})
            removed++
          } else {
            fresh.push({ name, mtime: st.mtimeMs, size: st.size })
          }
        } catch {
          // skipped
        }
      }
      // size cap: oldest first
      fresh.sort((a, b) => a.mtime - b.mtime)
      let total = fresh.reduce((s, e) => s + e.size, 0)
      while (fresh.length > 0 && total > this.maxBytes) {
        const e = fresh.shift()!
        try {
          await fs.unlink(path.join(this.dir, e.name))
          removed++
          total -= e.size
        } catch {
          // skip if unlink failed; total estimate stays approximate
        }
      }
      return { removed, kept: fresh.length, totalBytes: total }
    } catch {
      return { removed, kept: 0, totalBytes: 0 }
    }
  }
}
