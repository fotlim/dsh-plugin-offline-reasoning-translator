// Offline smoke test: load lib/worker.js in a real worker thread, translate a few
// fragments, verify masking round-trips. No DSH involved.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { mask, unmask } from '../lib/mask.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)

const worker = new Worker(new URL('../lib/worker.js', import.meta.url), {
  workerData: {
    modelRoot: path.join(ROOT, 'models'),
    modelId: 'Xenova/opus-mt-en-zh',
    pipeline: 'translation',
    dtype: 'q8'
  }
})

let nextId = 1
const pending = new Map()
worker.on('message', (m) => {
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  m.ok ? p.resolve(m.text) : p.reject(new Error(m.error))
})
worker.on('error', (e) => {
  console.log('WORKER_ERROR', e.message)
  process.exit(1)
})

function ask(text) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, op: 'translate', text, targetLanguage: 'zh' })
  })
}

const CASES = [
  'I need to check whether the parser handles an empty list before dereferencing.',
  'The user asked me to refactor the runner into eight independent arms, which seems excessive.',
  'Run `npm test` and check https://example.com/docs for the failing case.'
]

const t0 = Date.now()
console.log('STEP loaded, translating', CASES.length, 'fragments')
for (const source of CASES) {
  const { masked, slots } = mask(source)
  const started = Date.now()
  const out = await ask(masked)
  const restored = unmask(out, slots)
  console.log('---')
  console.log('SRC ', source)
  console.log('MASK', masked)
  console.log('OUT ', restored)
  console.log('MS  ', Date.now() - started, 'slots', slots.length)
}
console.log('TOTAL_MS', Date.now() - t0)
console.log('RSS_MB', Math.round(process.memoryUsage().rss / 1048576))
await worker.terminate()
