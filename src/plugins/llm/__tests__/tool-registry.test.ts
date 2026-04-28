import { describe, it, expect } from 'vitest'
import { ToolRegistry, type ToolHandler } from '../tools'

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
