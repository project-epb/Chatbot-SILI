import { describe, it, expect } from 'vitest'
import Logger from 'reggol'

import {
  buildCodeSandboxHandler,
  renderCodeSandboxResult,
} from '../tools/code-sandbox'

const silentLogger = new Logger('test-code-sandbox-tool')
silentLogger.level = Logger.SILENT

const fakeToolCtx = {
  ctx: {} as any,
  logger: silentLogger,
  session: {} as any,
  turnState: {},
}

describe('buildCodeSandboxHandler', () => {
  it('returns markdown with stdout + return on success', async () => {
    const handler = buildCodeSandboxHandler(silentLogger, {
      inlineExecution: true,
    })
    const out = await handler.execute(
      { code: 'function main() { console.log("hi"); return 7 }' },
      fakeToolCtx
    )
    expect(out).toContain('### stdout')
    expect(out).toContain('[log] hi')
    expect(out).toContain('### return')
    expect(out).toContain('7')
  })

  it('returns error message on failure', async () => {
    const handler = buildCodeSandboxHandler(silentLogger, {
      inlineExecution: true,
    })
    const out = await handler.execute(
      { code: 'function main() { throw new Error("boom") }' },
      fakeToolCtx
    )
    expect(out).toContain('Error:')
    expect(out).toContain('boom')
  })

  it('rejects missing code arg', async () => {
    const handler = buildCodeSandboxHandler(silentLogger, {
      inlineExecution: true,
    })
    const out = await handler.execute({} as any, fakeToolCtx)
    expect(out).toMatch(/missing required field "code"/)
  })

  it('respects timeout_ms input', async () => {
    const handler = buildCodeSandboxHandler(silentLogger, {
      inlineExecution: true,
    })
    const out = await handler.execute(
      { code: 'function main() { while(true){} }', timeout_ms: 150 },
      fakeToolCtx
    )
    expect(out).toContain('timed out after 150ms')
  }, 5000)
})

describe('renderCodeSandboxResult', () => {
  it('shows return section when returnValue present', () => {
    const out = renderCodeSandboxResult({
      stdout: '',
      returnValue: '42',
      errorMessage: undefined,
      durationMs: 5,
    })
    expect(out).toContain('### return')
    expect(out).not.toContain('no output')
  })

  it('shows "(no output)" when nothing returned and no stdout', () => {
    const out = renderCodeSandboxResult({
      stdout: '',
      returnValue: undefined,
      errorMessage: undefined,
      durationMs: 5,
    })
    expect(out).toContain('(no output)')
  })

  it('renders duration suffix', () => {
    const out = renderCodeSandboxResult({
      stdout: '',
      returnValue: 'x',
      errorMessage: undefined,
      durationMs: 42,
    })
    expect(out).toMatch(/_\(42ms\)_/)
  })

  it('strips trailing newline from stdout before fencing', () => {
    const out = renderCodeSandboxResult({
      stdout: '[log] hi\n',
      returnValue: undefined,
      errorMessage: undefined,
      durationMs: 5,
    })
    expect(out).toContain('```\n[log] hi\n```')
  })
})
