// Does terminating the worker WHILE onnxruntime is mid-inference crash the
// process? That is what the aborted-request path does: the caller stops waiting
// but the native call keeps running in the worker.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)

function makeWorker() {
  return new Worker(new URL('../lib/worker.js', import.meta.url), {
    workerData: { modelRoot: path.join(ROOT, 'models'), modelId: 'Xenova/opus-mt-en-zh', pipeline: 'translation', dtype: 'q8' }
  })
}

const worker = makeWorker()
let nextId = 1
const pending = new Map()
worker.on('message', (m) => {
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  m.ok ? p.resolve(m.text) : p.reject(new Error(m.error))
})
function ask(text, id = nextId++) {
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, op: 'translate', text, targetLanguage: 'zh' })
  })
}

await ask('A short warmup sentence so the model is resident.')
console.log('WARMED')

// Fire a long translation, do NOT await it, then kill the worker mid-flight.
const long = 'This sentence is deliberately long so that inference takes a while and the worker is still busy inside the native ONNX call when we terminate it, which is exactly the situation created by an aborted request in the service.'
void ask(long).catch((e) => console.log('PENDING_REJECTED', e.message))
await new Promise((r) => setTimeout(r, 120))
console.log('TERMINATING MID_INFERENCE')
await worker.terminate()
console.log('TERMINATED')
process.exit(0)
