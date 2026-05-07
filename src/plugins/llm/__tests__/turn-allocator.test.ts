import { describe, expect, it, vi } from 'vitest'

import { TurnAllocator } from '../services/turn-allocator'

function makeMockCtx(perConv: Record<string, number>) {
  const calls: Array<{ table: string; where: any }> = []
  const ctx: any = {
    database: {
      get: vi.fn(async (table: string, where: any) => {
        calls.push({ table, where })
        const max = perConv[where.conversation_id] ?? 0
        return max > 0 ? [{ turn_number: max }] : []
      }),
    },
  }
  return { ctx, calls }
}

describe('TurnAllocator', () => {
  it('first allocate reads max from db, then increments', async () => {
    const { ctx, calls } = makeMockCtx({ conv1: 5 })
    const allocator = new TurnAllocator(ctx)
    expect(await allocator.allocate('conv1')).toBe(6)
    expect(await allocator.allocate('conv1')).toBe(7)
    expect(await allocator.allocate('conv1')).toBe(8)
    // db read should happen exactly once
    expect(calls.length).toBe(1)
  })

  it('initializes to 0 when conversation has no rows yet', async () => {
    const { ctx } = makeMockCtx({})
    const allocator = new TurnAllocator(ctx)
    expect(await allocator.allocate('newconv')).toBe(1)
    expect(await allocator.allocate('newconv')).toBe(2)
  })

  it('isolates counters across conversations', async () => {
    const { ctx } = makeMockCtx({ a: 10, b: 0 })
    const allocator = new TurnAllocator(ctx)
    expect(await allocator.allocate('a')).toBe(11)
    expect(await allocator.allocate('b')).toBe(1)
    expect(await allocator.allocate('a')).toBe(12)
    expect(await allocator.allocate('b')).toBe(2)
  })

  it('concurrent first-time allocates share one db read', async () => {
    let resolve: (rows: any[]) => void = () => {}
    const ctx: any = {
      database: {
        get: vi.fn(
          () =>
            new Promise((r) => {
              resolve = r
            })
        ),
      },
    }
    const allocator = new TurnAllocator(ctx)

    const p1 = allocator.allocate('shared')
    const p2 = allocator.allocate('shared')
    const p3 = allocator.allocate('shared')

    // db read fires once even though 3 allocate() calls in flight
    expect(ctx.database.get).toHaveBeenCalledTimes(1)

    resolve([{ turn_number: 7 }])
    const results = await Promise.all([p1, p2, p3])
    expect(results.sort((a, b) => a - b)).toEqual([8, 9, 10])
    expect(ctx.database.get).toHaveBeenCalledTimes(1)
  })

  it('peek does not advance the counter', async () => {
    const { ctx } = makeMockCtx({ c: 3 })
    const allocator = new TurnAllocator(ctx)
    expect(await allocator.allocate('c')).toBe(4)
    expect(allocator.peek('c')).toBe(4)
    expect(allocator.peek('c')).toBe(4) // peek again, unchanged
    expect(await allocator.allocate('c')).toBe(5)
  })

  it('reset wipes in-memory state, next allocate re-reads db', async () => {
    const { ctx } = makeMockCtx({ d: 9 })
    const allocator = new TurnAllocator(ctx)
    expect(await allocator.allocate('d')).toBe(10)
    allocator.reset()
    // After reset, next allocate triggers a fresh db read
    expect(await allocator.allocate('d')).toBe(10) // mock still says max=9
    expect(ctx.database.get).toHaveBeenCalledTimes(2)
  })
})
