import { describe, it, expect } from 'vitest'
import Logger from 'reggol'

import {
  CodeSandboxRuntime,
  classifyError,
  type CodeSandboxRuntimeConfig,
} from '../services/code-sandbox-runtime'

const silentLogger = new Logger('test-code-sandbox')
silentLogger.level = Logger.SILENT

// All tests use inlineExecution so they exercise the inner QuickJS logic
// directly without spawning a worker_thread per call. The worker layer
// is a thin orchestrator and is exercised by the bot in production +
// covered by a smoke test elsewhere.
const mkRuntime = (cfg: CodeSandboxRuntimeConfig = {}) =>
  new CodeSandboxRuntime(silentLogger, { inlineExecution: true, ...cfg })

describe('CodeSandboxRuntime', () => {
  it('placeholder', () => {
    const r = mkRuntime()
    expect(r).toBeDefined()
  })
})

describe('sync main', () => {
  it('runs sync function main returning a number', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return 1 + 1 }')
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBe('2')
    expect(result.stdout).toBe('')
  })
})

describe('entry validation', () => {
  it('rejects code with no main defined', async () => {
    const r = mkRuntime()
    const result = await r.run('const x = 1')
    expect(result.errorMessage).toContain('requires a top-level "function main()"')
    expect(result.returnValue).toBeUndefined()
  })

  it('rejects code where main is not a function', async () => {
    const r = mkRuntime()
    const result = await r.run('const main = 42')
    expect(result.errorMessage).toContain('requires a top-level "function main()"')
  })
})

describe('syntax errors', () => {
  it('returns SyntaxError with name + message for unparseable code', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return 1 +')
    expect(result.errorMessage).toMatch(/^SyntaxError:/)
    expect(result.returnValue).toBeUndefined()
  })
})

describe('runtime exceptions inside main', () => {
  it('surfaces Error thrown by main', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { throw new Error("boom") }')
    expect(result.errorMessage).toBe('Error: boom')
    expect(result.returnValue).toBeUndefined()
  })

  it('surfaces TypeError thrown by main', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { null.x }')
    expect(result.errorMessage).toMatch(/^TypeError:/)
  })

  it('preserves stdout captured before main() throws', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      function main() {
        console.log('before throw')
        throw new Error('boom')
      }
    `)
    expect(result.errorMessage).toBe('Error: boom')
    expect(result.stdout).toBe('[log] before throw\n')
  })
})

describe('return value serialization', () => {
  it('string returned as-is without quotes', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return "hello world" }')
    expect(result.returnValue).toBe('hello world')
  })

  it('null returned as "null"', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return null }')
    expect(result.returnValue).toBe('null')
  })

  it('boolean returned as string', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return true }')
    expect(result.returnValue).toBe('true')
  })

  it('undefined return → no return value section', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() {}')
    expect(result.returnValue).toBeUndefined()
    expect(result.errorMessage).toBeUndefined()
  })

  it('object returned as pretty JSON', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return {a:1,b:[2,3]} }')
    expect(result.returnValue).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
  })
})

describe('return value edge cases', () => {
  it('truncates large object output', async () => {
    const r = mkRuntime()
    const result = await r.run(
      'function main() { return Array.from({length: 1000}, (_, i) => ({i, s: "x".repeat(20)})) }'
    )
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBeDefined()
    expect(result.returnValue!.length).toBeLessThan(5000)
    expect(result.returnValue!).toMatch(/\(truncated/)
  })

  it('falls back to String() for top-level Symbol (JSON.stringify returns undefined)', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return Symbol("x") }')
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toMatch(/non-JSON parts/)
  })

  it('truncates by bytes, not chars, for multibyte content', async () => {
    const r = mkRuntime({ returnValueByteCap: 400 })
    const result = await r.run(
      'function main() { return { s: "中".repeat(500) } }'
    )
    expect(result.returnValue).toMatch(/\(truncated/)
    // 中 is 3 bytes in UTF-8 → at 400 byte cap, at most ~133 multibyte chars
    // before the suffix, even though char-indexed slicing would yield ~400.
    const beforeSuffix = result.returnValue!.split('\n... (truncated')[0]
    expect(Buffer.byteLength(beforeSuffix, 'utf8')).toBeLessThanOrEqual(400)
  })
})

describe('console injection', () => {
  it('captures console.log with [log] prefix', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      function main() {
        console.log('hello', 'world')
        console.log(42)
        return 'done'
      }
    `)
    expect(result.errorMessage).toBeUndefined()
    expect(result.stdout).toBe('[log] hello world\n[log] 42\n')
    expect(result.returnValue).toBe('done')
  })

  it('captures console.warn and console.error with correct prefixes', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      function main() {
        console.warn('warn-msg')
        console.error('err-msg')
      }
    `)
    expect(result.stdout).toBe('[warn] warn-msg\n[error] err-msg\n')
  })

  it('serializes object arguments via JSON.stringify', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      function main() { console.log({a: 1}) }
    `)
    expect(result.stdout).toBe('[log] {"a":1}\n')
  })
})

describe('stdout truncation', () => {
  it('truncates stdout past byte limit', async () => {
    const r = mkRuntime({ stdoutByteLimit: 200 })
    const result = await r.run(`
      function main() {
        for (let i = 0; i < 100; i++) console.log('x'.repeat(50))
      }
    `)
    expect(result.stdout).toMatch(/stdout truncated at \d+ bytes/)
    expect(result.stdout.length).toBeLessThan(400)
    expect(result.stdout.match(/stdout truncated/g)?.length).toBe(1)
  })
})

describe('async main', () => {
  it('awaits async main returning a resolved Promise', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      async function main() { return await Promise.resolve(42) }
    `)
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBe('42')
  })

  it('handles main returning a manually constructed Promise', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      function main() {
        return new Promise(resolve => resolve('done'))
      }
    `)
    expect(result.returnValue).toBe('done')
  })

  it('surfaces async main rejection as an error', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      async function main() { throw new Error('async-boom') }
    `)
    expect(result.errorMessage).toBe('Error: async-boom')
    expect(result.returnValue).toBeUndefined()
  })

  it('preserves stdout captured before async main rejects', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      async function main() {
        console.log('before reject')
        throw new Error('async-boom')
      }
    `)
    expect(result.errorMessage).toBe('Error: async-boom')
    expect(result.stdout).toBe('[log] before reject\n')
  })

  it('serializes async object return via JSON', async () => {
    const r = mkRuntime()
    const result = await r.run(`
      async function main() { return { a: 1, b: [2, 3] } }
    `)
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
  })
})

describe('timeout', () => {
  it('aborts CPU loop via interrupt handler', async () => {
    const r = mkRuntime()
    const result = await r.run(
      'function main() { while (true) {} }',
      { timeoutMs: 200 }
    )
    expect(result.errorMessage).toBe('Error: execution timed out after 200ms')
    expect(result.returnValue).toBeUndefined()
  }, 5000)

  it('aborts never-resolving Promise via host-side race', async () => {
    const r = mkRuntime()
    const result = await r.run(
      'function main() { return new Promise(() => {}) }',
      { timeoutMs: 200 }
    )
    expect(result.errorMessage).toBe('Error: execution timed out after 200ms')
    expect(result.returnValue).toBeUndefined()
  }, 5000)

  it('drains chained promises across multiple ticks (does NOT time out)', async () => {
    const r = mkRuntime()
    const result = await r.run(
      `function main() {
        return Promise.resolve()
          .then(() => Promise.resolve())
          .then(() => Promise.resolve())
          .then(() => Promise.resolve(42))
      }`,
      { timeoutMs: 1000 }
    )
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBe('42')
  })

  it('preserves stdout captured before CPU timeout', async () => {
    const r = mkRuntime()
    const result = await r.run(
      `function main() {
        console.log('before loop')
        while (true) {}
      }`,
      { timeoutMs: 200 }
    )
    expect(result.errorMessage).toBe('Error: execution timed out after 200ms')
    expect(result.stdout).toBe('[log] before loop\n')
  }, 5000)

  it('preserves stdout captured before async hang', async () => {
    const r = mkRuntime()
    const result = await r.run(
      `async function main() {
        console.log('before hang')
        return new Promise(() => {})
      }`,
      { timeoutMs: 200 }
    )
    expect(result.errorMessage).toBe('Error: execution timed out after 200ms')
    expect(result.stdout).toBe('[log] before hang\n')
  }, 5000)

  it('clamps user-provided timeout_ms to maxTimeoutMs', async () => {
    const r = mkRuntime({ maxTimeoutMs: 300 })
    const result = await r.run(
      'function main() { while (true) {} }',
      { timeoutMs: 5000 } // user wants 5s, runtime caps at 300ms
    )
    expect(result.errorMessage).toBe('Error: execution timed out after 300ms')
  }, 5000)

  it('uses defaultTimeoutMs when no timeout_ms is passed', async () => {
    const r = mkRuntime({
      defaultTimeoutMs: 150,
      maxTimeoutMs: 1000,
    })
    const result = await r.run('function main() { while (true) {} }')
    expect(result.errorMessage).toBe('Error: execution timed out after 150ms')
  }, 5000)
})

describe('memory limit', () => {
  it('rejects allocation past memory limit', async () => {
    const r = mkRuntime({ memoryLimitMb: 4 })
    const result = await r.run(`
      function main() {
        const arr = []
        for (let i = 0; i < 1_000_000; i++) arr.push({a: i, b: 'x'.repeat(100)})
        return arr.length
      }
    `)
    expect(result.errorMessage).toBe('Error: memory limit exceeded')
    expect(result.returnValue).toBeUndefined()
  }, 10000)

  it('preserves stdout captured before OOM', async () => {
    const r = mkRuntime({ memoryLimitMb: 4 })
    const result = await r.run(`
      function main() {
        console.log('before oom')
        const arr = []
        for (let i = 0; i < 1_000_000; i++) arr.push({a: i, b: 'x'.repeat(100)})
      }
    `)
    expect(result.errorMessage).toBe('Error: memory limit exceeded')
    expect(result.stdout).toBe('[log] before oom\n')
  }, 10000)

  it('classifies OOM as memory error even under aggressive timeout pressure', async () => {
    // A single large opcode that overshoots the heap before the per-opcode
    // interrupt handler can preempt. Tight (but realistic) timeout proves
    // that when QuickJS actually surfaces "out of memory", the classifier
    // returns memoryMessage — not whatever timeoutMessage would have been
    // synthesized.
    const r = mkRuntime({ memoryLimitMb: 4 })
    const result = await r.run(
      `function main() { return 'x'.repeat(50_000_000) }`,
      { timeoutMs: 100 }
    )
    expect(result.errorMessage).toBe('Error: memory limit exceeded')
  }, 10000)
})

describe('config sanitization', () => {
  // Regression: plugin glue passes `{ defaultTimeoutMs: sb.defaultTimeoutMs }`
  // which becomes `{ defaultTimeoutMs: undefined }` when user didn't set it.
  // A naive `{ ...DEFAULT_CONFIG, ...cfg }` would let undefined shadow the
  // default. Symptoms: NaN deadline + setTimeout(fn, NaN) killed workers
  // immediately, every tool call timed out before it could run.
  it('drops explicit-undefined config values instead of overwriting defaults', async () => {
    const r = mkRuntime({
      defaultTimeoutMs: undefined,
      maxTimeoutMs: undefined,
    })
    const result = await r.run('function main() { return 42 }')
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBe('42')
  })

  it('falls back to default when timeout_ms is NaN', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return 1 }', {
      timeoutMs: NaN as any,
    })
    expect(result.errorMessage).toBeUndefined()
    expect(result.returnValue).toBe('1')
  })
})

describe('DoS protection (defaults)', () => {
  // Regression: before the per-call newQuickJSWASMModule switch + flipping
  // disableHostLimits default back to false, a sandboxed call could
  // allocate 1GB+ host memory in a single opcode (e.g. 'A'.repeat(1e9))
  // because we'd disabled setMemoryLimit to work around a singleton-WASM
  // contamination bug. This test pins that the default config now catches
  // that case via setMemoryLimit on a fresh per-call WASM module.
  it('1GB string allocation in a single opcode is caught by default config', async () => {
    const r = mkRuntime()
    const result = await r.run(
      `function main() { return 'A'.repeat(1_000_000_000) }`,
      { timeoutMs: 5000 }
    )
    expect(result.errorMessage).toBe('Error: memory limit exceeded')
    expect(result.returnValue).toBeUndefined()
  }, 10000)

  // RSS watchdog is intentionally not tested. Empirically the QuickJS
  // interrupt handler fires too rarely (cycle-counted, ~once per 50ms in
  // a tight loop) and the async pump loop completes in a single
  // microtask flush for `await Promise.resolve()`-style chains. The
  // watchdog is kept as best-effort defense for genuinely long-running
  // async waits; setMemoryLimit (above) is the actual DoS defense.
})

describe('classifyError precedence', () => {
  // Unit-level pin for "memory wins over timeout" ordering. The full integration
  // scenario (OOM that happens AFTER deadline) is unreachable in practice: the
  // QuickJS interrupt handler is checked per-opcode and always preempts before
  // a gradual fill can OOM, while single-opcode allocations OOM in <1ms before
  // the deadline can pass. So we pin the chain at the helper layer directly.
  const timeoutMsg = 'Error: execution timed out after 1ms'
  const memoryMsg = 'Error: memory limit exceeded'
  const oomErr = { name: 'InternalError', message: 'out of memory' }
  const otherErr = { name: 'TypeError', message: 'foo is not a function' }
  const pastDeadline = Date.now() - 1000
  const futureDeadline = Date.now() + 60_000

  it('memory wins when deadline has also passed', () => {
    expect(classifyError(oomErr, pastDeadline, timeoutMsg, memoryMsg)).toBe(memoryMsg)
  })
  it('timeout wins when only deadline matched (non-memory error)', () => {
    expect(classifyError(otherErr, pastDeadline, timeoutMsg, memoryMsg)).toBe(timeoutMsg)
  })
  it('falls through to formatVmError when neither matches', () => {
    expect(classifyError(otherErr, futureDeadline, timeoutMsg, memoryMsg)).toBe('TypeError: foo is not a function')
  })
  it('memory wins even before deadline', () => {
    expect(classifyError(oomErr, futureDeadline, timeoutMsg, memoryMsg)).toBe(memoryMsg)
  })
})

describe('isolation', () => {
  it.each([
    ['fetch', 'fetch("https://example.com")'],
    ['process', 'process.exit(1)'],
    ['require', 'require("fs")'],
    ['setTimeout', 'setTimeout(() => {}, 0)'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['Bun', 'Bun.spawn(["ls"])'],
    ['Deno', 'Deno.readFile("/etc/hosts")'],
  ])('rejects access to host API: %s', async (_, snippet) => {
    const r = mkRuntime()
    const result = await r.run(`function main() { ${snippet} }`)
    expect(result.errorMessage).toMatch(/ReferenceError|not defined|TypeError/)
  })
})

describe('native ECMAScript builtins available', () => {
  it('Math.sqrt works', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return Math.sqrt(2) }')
    expect(parseFloat(result.returnValue!)).toBeCloseTo(1.41421356, 6)
  })

  it('Date works', async () => {
    const r = mkRuntime()
    const result = await r.run(
      'function main() { return new Date("2024-01-01T00:00:00Z").toISOString() }'
    )
    expect(result.returnValue).toBe('2024-01-01T00:00:00.000Z')
  })

  it('BigInt works', async () => {
    const r = mkRuntime()
    const result = await r.run('function main() { return (2n ** 64n).toString() }')
    expect(result.returnValue).toBe('18446744073709551616')
  })
})
