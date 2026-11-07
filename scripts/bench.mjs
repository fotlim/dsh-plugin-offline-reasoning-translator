/**
 * Offline quality bench: same corpus, several decoding/glossary settings.
 *
 *   node scripts/bench.mjs                     # baseline: no glossary, greedy
 *   node scripts/bench.mjs --glossary          # + term masking + cleanup
 *   node scripts/bench.mjs --beams=4           # + beam search
 *   node scripts/bench.mjs --norepeat=3        # + no-repeat-3-grams
 *
 * Prints one block per configuration so the translations can be compared by eye;
 * timings show what each knob costs.
 */

import { pipeline, env } from '@huggingface/transformers'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { mask, unmask } from '../lib/mask.js'
import { repairConcepts, resolveGlossary } from '../lib/glossary.js'
import { postprocess } from '../lib/postprocess.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const CORPUS = [
  'When a grep over the log finds nothing, the parser may still be skipping the empty list.',
  'The BLEU score dropped because the store never updated its index.',
  'This is an edge case: a race condition between the worker thread and the event loop.',
  'Make the handler idempotent so a retried request cannot apply the side effects twice.',
  'The dependency injection container resolves the middleware on first use.',
  'Fix the memory leak by clearing the tokenizer cache after each batch.',
  'The stack trace points at the serializer, not at the recursive function.',
  'A cold start costs eleven hundred milliseconds, so warm up the pipeline once.',
  'The instruction says to refactor the runner into eight independent arms.',
  'We cut network round trips by caching the response for five minutes.',
  'The type inference fails because the closure captures a mutable variable.',
  'Please review the pull request before the breaking change lands.',
  'Run the integration test with `pnpm test --filter core` and paste the output.',
  'The throughput of the thread pool is bounded by the garbage collection pauses.',
  'Serialization of the embedding table dominates the latency budget.',
  'Check https://example.com/docs for the exact CLI flags.',
  'The worker threads share no memory, which removes most of the race conditions.',
  'If the source map is missing, the error points at the bundled file.',
  'The hash table grows without bound because the iterator never releases keys.',
  'Idempotency matters here: replaying the event must not duplicate the record.'
]

const options = {}
for (const argument of process.argv.slice(2)) {
  const [key, value] = argument.replace(/^--/, '').split('=')
  options[key] = value ?? true
}

env.allowRemoteModels = false
env.allowLocalModels = true
env.useBrowserCache = false
env.localModelPath = path.join(ROOT, 'models', path.sep)

const generation = { max_new_tokens: 512 }
if (options.beams !== undefined && options.beams !== true) generation.num_beams = Number(options.beams)
if (options.norepeat !== undefined && options.norepeat !== true) {
  generation.no_repeat_ngram_size = Number(options.norepeat)
}
if (options.lengthPenalty !== undefined) generation.length_penalty = Number(options.lengthPenalty)

const useGlossary = options.glossary === true
const repairOnly = options.repair === true
const glossary = useGlossary ? resolveGlossary() : undefined
const doRepair = useGlossary || repairOnly

const label = [
  `beams=${generation.num_beams ?? 1}`,
  `norepeat=${generation.no_repeat_ngram_size ?? 'off'}`,
  `mask=${useGlossary ? 'on' : 'off'}`,
  `repair=${doRepair ? 'on' : 'off'}`,
  `cleanup=${doRepair ? 'on' : 'off'}`
].join(' ')

const startedAt = Date.now()
const translator = await pipeline('translation', 'Xenova/opus-mt-en-zh', {
  dtype: 'q8',
  device: 'cpu'
})
const loadMs = Date.now() - startedAt

const elapsed = []
const rows = []
console.log(`CONFIG ${label}`)
console.log(`LOAD_MS ${loadMs}`)
for (const [index, sentence] of CORPUS.entries()) {
  const { masked, slots } = mask(sentence, glossary)
  const begun = Date.now()
  const output = await translator(masked, generation)
  elapsed.push(Date.now() - begun)
  let translated = unmask(output[0].translation_text, slots)
  if (doRepair) translated = postprocess(repairConcepts(translated))
  rows.push({ index: index + 1, ms: elapsed.at(-1), en: sentence, masked, zh: translated, raw: output[0].translation_text })
  console.log(`--- ${index + 1} (${elapsed.at(-1)} ms)`)
  console.log(`ZH  ${translated}`)
}
elapsed.sort((left, right) => left - right)
const median = elapsed[Math.floor(elapsed.length / 2)]
const mean = Math.round(elapsed.reduce((total, value) => total + value, 0) / elapsed.length)
const rss = Math.round(process.memoryUsage().rss / 1048576)
const slug = label.replace(/[^a-z0-9]+/gi, '-')
writeFileSync(
  path.join(HERE, '..', `bench-${slug}.json`),
  `${JSON.stringify({ label, loadMs, median, mean, rss, generation, useGlossary, rows }, null, 2)}\n`,
  'utf8'
)
console.log(`MEDIAN_MS ${median} MEAN_MS ${mean} RSS_MB ${rss}`)