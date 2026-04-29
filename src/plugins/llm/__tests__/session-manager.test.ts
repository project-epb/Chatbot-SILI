import { describe, it, expect } from 'vitest'
import { composeSystemPrompt } from '../session-manager'

const CATALOG = '## 可用指令\n\nfoo — example command'
const MEMORY = '- 喜欢吃热干面'
const BASE = 'you are SILI, a 19yo girl'

describe('composeSystemPrompt', () => {
  it('returns just the base prompt when catalog and memory are both empty', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: '',
      memory_snapshot: '',
    })
    expect(out).toBe(BASE)
  })

  it('appends the catalog and tool-usage section when catalog is non-empty', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: '',
    })
    expect(out).toContain(BASE)
    expect(out).toContain(CATALOG)
    expect(out).toContain('## 调用工具')
    expect(out).toContain('execute_koishi_command')
    expect(out).not.toContain('长期记忆')
  })

  it('appends the memory section when memory is non-empty', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: '',
      memory_snapshot: MEMORY,
    })
    expect(out).toContain(BASE)
    expect(out).toContain('## 关于这个用户的长期记忆')
    expect(out).toContain(MEMORY)
    expect(out).not.toContain('## 调用工具')
  })

  it('combines all three when present, in stable order', () => {
    const out = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: MEMORY,
    })
    const baseIdx = out.indexOf(BASE)
    const catalogIdx = out.indexOf(CATALOG)
    const memoryIdx = out.indexOf(MEMORY)
    expect(baseIdx).toBeGreaterThanOrEqual(0)
    expect(catalogIdx).toBeGreaterThan(baseIdx)
    expect(memoryIdx).toBeGreaterThan(catalogIdx)
  })

  it('is deterministic — same input produces byte-identical output', () => {
    const a = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: MEMORY,
    })
    const b = composeSystemPrompt({
      base_prompt: BASE,
      command_catalog: CATALOG,
      memory_snapshot: MEMORY,
    })
    expect(a).toBe(b)
  })
})
