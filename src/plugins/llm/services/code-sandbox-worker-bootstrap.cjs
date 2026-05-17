/**
 * CommonJS bootstrap for the code-sandbox worker thread.
 *
 * Why this file exists: tsx's `--import tsx` loader registration is gated
 * on `isMainThread === true`, so spawning a worker that points directly
 * at `code-sandbox-worker.ts` fails to resolve nested imports — the
 * worker entry loads (tsx handles the top-level file) but `import from
 * './code-sandbox-runtime'` inside it does not.
 *
 * Bootstrap registers tsx manually via `tsx/cjs/api.register()`, which
 * works in worker threads, then requires the worker.ts entry. After
 * register() the entire require/import chain inside the worker can
 * resolve .ts files transparently.
 *
 * Keep this file CJS — `register` must run synchronously before the
 * worker imports anything else.
 */
const { register } = require('tsx/cjs/api')
register()
require('./code-sandbox-worker.ts')
