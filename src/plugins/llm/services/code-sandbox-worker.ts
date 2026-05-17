/**
 * Worker thread entry for the code sandbox. Receives the user code +
 * config via workerData, runs `runSandboxInline` (which spins up its
 * own QuickJS WASM instance in this isolate), posts the result back,
 * and exits.
 *
 * Why a worker: in SILI's long-running cordis process the QuickJS WASM
 * module traps on every call (`RuntimeError: memory access out of
 * bounds`). Fresh node processes / fresh V8 isolates do not. Worker
 * threads give us a fresh V8 isolate per call, sidestepping the
 * corruption without spawning a child process.
 */
import { parentPort, workerData } from 'node:worker_threads'

import {
  runSandboxInline,
  type CodeSandboxResult,
  type CodeSandboxRuntimeConfig,
} from './code-sandbox-runtime'

interface WorkerInput {
  code: string
  opts: { timeoutMs?: number }
  cfg: Required<CodeSandboxRuntimeConfig>
}

type WorkerOutput =
  | { ok: true; result: CodeSandboxResult }
  | { ok: false; error: string }

// Minimal logger that pipes diagnostics back through console (which
// docker/tsx pipes to stderr → bot logs). Avoids depending on reggol
// or koishi inside the worker.
const workerLogger = {
  warn: (msg: any, ...args: any[]) => {
    // eslint-disable-next-line no-console
    console.warn('[code-sandbox-worker]', msg, ...args)
  },
}

;(async () => {
  if (!parentPort) {
    // Worker invoked outside worker_threads — shouldn't happen.
    process.exit(1)
  }
  try {
    const { code, opts, cfg } = workerData as WorkerInput
    const result = await runSandboxInline(code, cfg, opts, workerLogger)
    parentPort.postMessage({ ok: true, result } as WorkerOutput)
  } catch (e: any) {
    parentPort.postMessage({
      ok: false,
      error: e?.message ?? String(e),
    } as WorkerOutput)
  }
})()
