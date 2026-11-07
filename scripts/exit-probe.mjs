// Narrow the exit-code crash: does terminating the ORT worker mid-life crash,
// or is it only the process teardown path? Run three variants back to back.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)
const VARIANT = process.argv[2] ?? 'terminate'

const worker = new Worker(new URL('../lib/worker.js', import.meta.url), {
  workerData: { modelRoot: path.join(ROOT, 'models'), modelId: 'Xenova/opus-mt-en-zh', pipeline: 'translation', dtype: 'q8' }
})
let nextId = 1
const pending = new Map()
worker.on('message', (m) => {
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  m.ok ? p.resolve(m.text) : p.reject(new Error(m.error))
})
function ask(text) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, op: 'translate', text, targetLanguage: 'zh' })
  })
}

console.log('VARIANT', VARIANT)
console.log('OUT', await ask('The build stopped because the compiler could not find a matching target.'))

if (VARIANT === 'terminate') {
  await worker.terminate()
  console.log('TERMINATED')
  process.exit(0)
} else if (VARIANT === 'natural') {
  await worker.terminate()
  console.log('TERMINATED, letting node exit on its own')
  // no process.exit: observe the real teardown path
} else if (VARIANT === 'noexit') {
  // terminate and exit with a short delay so libuv drains
  await worker.terminate()
  console.log('TERMINATED')
  setTimeout(() => { console.log('DONE'); process.exit(0) }, 250)
}
