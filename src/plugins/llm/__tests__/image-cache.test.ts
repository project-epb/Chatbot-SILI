import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readdir, stat, utimes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ImageReferenceCache } from '../services/image-cache'

const SMALL_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAarVyFEAAAAASUVORK5CYII='
const ANOTHER_DATA_URI =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgP//Z'

describe('ImageReferenceCache (disk)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'image-cache-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('register writes a file with deterministic id', async () => {
    const c = new ImageReferenceCache({ dir })
    const id1 = await c.register(SMALL_DATA_URI)
    const id2 = await c.register(SMALL_DATA_URI)
    expect(id1).toBe(id2)
    expect(id1).toMatch(/^[a-f0-9]{12}$/)
    const files = await readdir(dir)
    expect(files).toContain(`${id1}.b64`)
    expect(files).toHaveLength(1)
  })

  it('different uris get different ids and different files', async () => {
    const c = new ImageReferenceCache({ dir })
    const a = await c.register(SMALL_DATA_URI)
    const b = await c.register(ANOTHER_DATA_URI)
    expect(a).not.toBe(b)
    const files = await readdir(dir)
    expect(files.sort()).toEqual([`${a}.b64`, `${b}.b64`].sort())
  })

  it('resolve reads back the original uri', async () => {
    const c = new ImageReferenceCache({ dir })
    const id = await c.register(SMALL_DATA_URI)
    const out = await c.resolve(id)
    expect(out).toBe(SMALL_DATA_URI)
  })

  it('resolve returns undefined for unknown id', async () => {
    const c = new ImageReferenceCache({ dir })
    expect(await c.resolve('deadbeef0000')).toBeUndefined()
  })

  it('register on existing file just touches mtime, no rewrite', async () => {
    const c = new ImageReferenceCache({ dir })
    const id = await c.register(SMALL_DATA_URI)
    const fp = join(dir, `${id}.b64`)
    // Backdate the file so we can detect a touch.
    const past = new Date(Date.now() - 60_000)
    await utimes(fp, past, past)
    const stBefore = await stat(fp)
    await c.register(SMALL_DATA_URI)
    const stAfter = await stat(fp)
    expect(stAfter.mtimeMs).toBeGreaterThan(stBefore.mtimeMs)
  })

  it('replaceDataUrisWithRefs swaps inline base64 for short refs', async () => {
    const c = new ImageReferenceCache({ dir })
    const out = await c.replaceDataUrisWithRefs(
      `<img src="${SMALL_DATA_URI}"/>`
    )
    expect(out).toMatch(/^<img\s*ref="[a-f0-9]{12}"\/>$/)
    expect(out).not.toContain('data:image')
  })

  it('replaceDataUrisWithRefs preserves attributes around src', async () => {
    const c = new ImageReferenceCache({ dir })
    const out = await c.replaceDataUrisWithRefs(
      `<img alt="cat" src="${SMALL_DATA_URI}" width="100"/>`
    )
    expect(out).toContain('alt="cat"')
    expect(out).toContain('width="100"')
    expect(out).toMatch(/ref="[a-f0-9]{12}"/)
  })

  it('replaceDataUrisWithRefs leaves http urls alone', async () => {
    const c = new ImageReferenceCache({ dir })
    const out = await c.replaceDataUrisWithRefs(
      `<img src="https://example.com/a.png"/> 和 <img src="${SMALL_DATA_URI}"/>`
    )
    expect(out).toContain('https://example.com/a.png')
    expect(out).not.toContain('data:image')
    expect(out).toMatch(/ref="[a-f0-9]{12}"/)
  })

  it('round-trips: replace then resolve gives back the original', async () => {
    const c = new ImageReferenceCache({ dir })
    const original = `prefix <img src="${SMALL_DATA_URI}"/> suffix`
    const refified = await c.replaceDataUrisWithRefs(original)
    const restored = await c.resolveRefsToDataUris(refified)
    expect(restored).toBe(original)
  })

  it('resolveRefsToDataUris drops unknown refs', async () => {
    const c = new ImageReferenceCache({ dir })
    const out = await c.resolveRefsToDataUris('a <img ref="000000000000"/> b')
    expect(out).toBe('a  b')
  })

  it('text without data: or ref= short-circuits', async () => {
    const c = new ImageReferenceCache({ dir })
    expect(await c.replaceDataUrisWithRefs('hello')).toBe('hello')
    expect(await c.resolveRefsToDataUris('hello')).toBe('hello')
    // No directory work either
    const files = await readdir(dir).catch(() => [])
    expect(files).toEqual([])
  })

  it('cleanup deletes files older than ttl', async () => {
    const c = new ImageReferenceCache({ dir, ttlMs: 1000 })
    const id1 = await c.register(SMALL_DATA_URI)
    const id2 = await c.register(ANOTHER_DATA_URI)
    // Backdate id1 to past TTL
    const past = new Date(Date.now() - 5000)
    await utimes(join(dir, `${id1}.b64`), past, past)

    const r = await c.cleanup()
    expect(r.removed).toBe(1)
    const files = await readdir(dir)
    expect(files).toEqual([`${id2}.b64`])
  })

  it('cleanup deletes oldest first when over maxBytes', async () => {
    // Use a tiny cap to force eviction: each file is ~few hundred bytes,
    // cap at 1 byte forces both to be evicted (oldest first).
    const c = new ImageReferenceCache({ dir, maxBytes: 1 })
    const id1 = await c.register(SMALL_DATA_URI)
    // Backdate so id1 looks older
    const past = new Date(Date.now() - 60_000)
    await utimes(join(dir, `${id1}.b64`), past, past)
    await c.register(ANOTHER_DATA_URI)

    const r = await c.cleanup()
    // Both exceed cap; both get evicted, oldest first
    expect(r.removed).toBeGreaterThanOrEqual(1)
    const files = await readdir(dir)
    expect(files).not.toContain(`${id1}.b64`)
  })

  it('replaceDataUrisWithRefs skips images larger than maxImageBytes', async () => {
    // Construct a data URI longer than the cap. 1KB cap, 2KB payload.
    const big =
      'data:image/png;base64,' + 'A'.repeat(2048)
    const c = new ImageReferenceCache({ dir, maxImageBytes: 1024 })
    const out = await c.replaceDataUrisWithRefs(`<img src="${big}"/>`)
    expect(out).toBe('[图片过大已省略]')
    expect(out).not.toContain('data:image')
    expect(out).not.toContain('<img')
    // Nothing got cached either
    const files = await readdir(dir).catch(() => [])
    expect(files).toEqual([])
  })

  it('replaceDataUrisWithRefs handles mixed: small cached, big placeholder', async () => {
    const big = 'data:image/png;base64,' + 'B'.repeat(2048)
    const c = new ImageReferenceCache({ dir, maxImageBytes: 1024 })
    const out = await c.replaceDataUrisWithRefs(
      `小 <img src="${SMALL_DATA_URI}"/> 大 <img src="${big}"/>`
    )
    expect(out).toMatch(/ref="[a-f0-9]{12}"/) // small one cached
    expect(out).toContain('[图片过大已省略]') // big one placeholdered
    expect(out).not.toContain('data:image')
  })

  it('cleanup is safe when dir does not exist yet', async () => {
    const c = new ImageReferenceCache({ dir: join(dir, 'nested', 'deeper') })
    const r = await c.cleanup()
    expect(r.removed).toBe(0)
  })
})
