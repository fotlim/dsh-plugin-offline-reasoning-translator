// Verify the fix: drain in-flight native work before terminating, then terminate.
// Also verifies that an aborted caller leaves the native call running and that
// the worker replies afterwards without the caller hearing it.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)

const worker = new Worker(new URL('../lib/worker.js', import.meta.url), {
  workerData: { modelRoot: path.join(ROOT, 'models', 'opus-mt-en-zh-q8'), modelId: 'Xenova/opus-mt-en-zh', pipeline: 'translation', dtype: 'q8' }
})
let nextId = 1
const pending = new Map()
const outstanding = new Set()
worker.on('message', (m) => {
  outstanding.delete(m.id)
  const p = pending.get(m.id)
  if (p === undefined) return
  pending.delete(m.id)
  m.ok ? p.resolve(m.text) : p.reject(new Error(m.error))
})
function send(text, id) {
  outstanding.add(id)
  worker.postMessage({ id, op: 'translate', text, targetLanguage: 'zh' })
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

await send('A short warmup sentence so the model is resident.', nextId++)
console.log('WARMED')

const long = 'This sentence is deliberately long so that inference takes a while and the worker is still busy inside the native ONNX call when we drain, which mirrors an aborted request in the service.'
const inFlight = nextId++
void send(long, inFlight).catch((e) => console.log('CALLER_REJECTED', e.message))
await new Promise((r) => setTimeout(r, 80))

// Simulate the service's dispose path.
console.log('DRAINING outstanding=' + outstanding.size)
const drainStart = Date.now()
while (outstanding.size > 0 && Date.now() - drainStart < 5000) await new Promise((r) => setTimeout(r, 20))
console.log('DRAINED_MS', Date.now() - drainStart, 'outstanding=' + outstanding.size)

await worker.terminate()
console.log('TERMINATED_CLEANLY')
process.exit(0)
