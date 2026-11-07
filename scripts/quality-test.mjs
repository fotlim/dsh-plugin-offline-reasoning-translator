/**
 * Before/after harness for the repetition-loop fix.
 *
 * Path A feeds one whole paragraph to the model, which is what the plugin did
 * until a real fragment came back as `皮尔斯皮尔斯皮尔斯…`. Path B is the shipped
 * behaviour: sentences translated one at a time, each one refused when it
 * degenerates.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { mask, unmask } from '../lib/mask.js'
import { repairConcepts, resolveGlossary } from '../lib/glossary.js'
import { postprocess } from '../lib/postprocess.js'
import { looksDegenerate } from '../lib/quality.js'
import { splitForTranslation } from '../lib/segment.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const MODEL_ROOT = path.join(ROOT, 'models', 'opus-mt-en-zh-q8')

const TEXT = [
  'The runner keeps a small LRU cache keyed by the sha256 of the source text, so a repeated fragment costs nothing.',
  'Each worker owns one ONNX session and runs inference synchronously, which is why it must not share a thread with the host event loop.',
  'When the decoder is given a whole paragraph it tends to repeat itself: the beam keeps the same token because the model has no room to recover, and the result degrades into the same word over and over.',
  'Splitting at sentence boundaries fixes that, at the cost of one extra round trip per sentence.'
].join(' ')

const worker = new Worker(new URL('../lib/worker.js', import.meta.url), {
  workerData: {
    modelRoot: MODEL_ROOT,
    modelId: 'Xenova/opus-mt-en-zh',
    pipeline: 'translation',
    dtype: 'q8'
  }
})

let nextId = 1
const pending = new Map()

worker.on('message', (message) => {
  const entry = pending.get(message.id)
  if (entry === undefined) return
  pending.delete(message.id)
  if (message.ok) entry.resolve(message.text)
  else entry.reject(new Error(message.error))
})

/** Ask the worker for one translation. */
function request(text) {
  const id = nextId
  nextId += 1
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, op: 'translate', text, targetLanguage: 'zh' })
  })
}

const glossary = resolveGlossary()

try {
  // Path A: the previous behaviour, one call for the whole paragraph.
  const startedA = Date.now()
  const maskedA = mask(TEXT, glossary)
  const rawA = await request(maskedA.masked)
  const oldResult = postprocess(repairConcepts(unmask(rawA, glossary ? maskedA.slots : maskedA.slots)))
  const oldMs = Date.now() - startedA
  const oldDegenerate = looksDegenerate(oldResult, TEXT)

  // Path B: the shipped pipeline.
  const startedB = Date.now()
  const pieces = splitForTranslation(TEXT)
  const parts = []
  let refused = 0
  for (const piece of pieces) {
    if (piece.text.trim() === '') {
      parts.push(piece.text + piece.sep)
      continue
    }
    const { masked, slots } = mask(piece.text, glossary)
    const raw = await request(masked)
    let restored = postprocess(repairConcepts(unmask(raw, slots)))
    if (looksDegenerate(restored, piece.text)) {
      refused += 1
      restored = piece.text
    }
    console.log(`PIECE ${restored}`)
    parts.push(restored + piece.sep)
  }
  const newResult = postprocess(parts.join(''))
  const newMs = Date.now() - startedB

  console.log('')
  console.log(`OLD_MS ${oldMs} OLD_DEGENERATE ${oldDegenerate}`)
  console.log(`OLD ${oldResult.slice(0, 400)}`)
  console.log('')
  console.log(`NEW_MS ${newMs} PIECES ${pieces.length} REFUSED ${refused}`)
  console.log(`NEW ${newResult.slice(0, 400)}`)

  assert.equal(looksDegenerate(newResult, TEXT), false, 'the shipped pipeline must not produce a loop')
} finally {
  await worker.terminate()
}
console.log('OK: quality harness finished')