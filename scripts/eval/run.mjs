// Quality regression harness: run the whole translation pipeline over a fixed
// English corpus and report the numbers a change can be judged against.
//
// The corpus is plain reasoning text, not marketing prose: the point is to catch
// the failures this model actually makes (loops, echoes, half-converted
// punctuation, mangled identifiers) and to keep them from coming back.
//
//   node scripts/eval/run.mjs [--label=baseline] [--limit=20] [--category=prose]
//
// Writes scripts/eval/results/eval-<label>.json and a Markdown table beside it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Context, Service } from '@deepseek-ai/cordis'

import OfflineReasoningTranslator from '../../index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORPUS = path.join(HERE, 'corpus.jsonl')
const RESULTS = path.join(HERE, 'results')

const HAN_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const LATIN_WORD = /[A-Za-z][A-Za-z'-]+/g

class StubTypert extends Service {
  constructor(ctx) {
    super(ctx, 'typert')
  }
}

/**
 * @param argv - process arguments.
 * @returns parsed options.
 */
function parseArgs(argv) {
  const options = { label: 'baseline', limit: Infinity, category: '' }
  for (const argument of argv) {
    if (argument.startsWith('--label=')) options.label = argument.slice(8)
    else if (argument.startsWith('--limit=')) options.limit = Number(argument.slice(8))
    else if (argument.startsWith('--category=')) options.category = argument.slice(11)
  }
  return options
}

/**
 * Load and filter the corpus.
 * @param options - parsed arguments.
 */
function loadCorpus(options) {
  const lines = readFileSync(CORPUS, 'utf8').split('\n').filter((line) => line.trim() !== '')
  const items = lines.map((line) => JSON.parse(line))
  const filtered = options.category === '' ? items : items.filter((item) => item.category === options.category)
  return filtered.slice(0, options.limit)
}

/**
 * Count Latin words that are not one of the expected identifiers: that residue
 * is what a reader experiences as "not translated".
 * @param text - Chinese output.
 * @param must - identifiers the output is allowed to keep in English.
 */
function residualEnglish(text, must) {
  let residue = text
  for (const term of must) residue = residue.split(term).join(' ')
  return (residue.match(LATIN_WORD) ?? []).length
}

/**
 * @param values - numbers.
 * @returns sorted copy.
 */
function sorted(values) {
  return [...values].sort((a, b) => a - b)
}

/**
 * @param values - numbers, already sorted.
 * @param fraction - percentile as a fraction of one.
 */
function percentile(values, fraction) {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * fraction)))
  return values[index]
}

const options = parseArgs(process.argv.slice(2))
const corpus = loadCorpus(options)

const ctx = new Context()
ctx.plugin(StubTypert)
ctx.plugin(OfflineReasoningTranslator)
await new Promise((resolve) => setTimeout(resolve, 50))
const service = ctx.offlineReasoningTranslator

// Warm the worker so the first measured sentence is not the cold load. The
// load cost is reported separately, because it is what a session actually pays.
const warmStart = Date.now()
await service.translate({ text: 'Warm up the model.', targetLanguage: 'zh' }, new AbortController().signal)
const coldMs = Date.now() - warmStart

const rows = []
for (const item of corpus) {
  const before = { ...service.stats }
  const start = Date.now()
  let output = ''
  let error = null
  try {
    output = await service.translate({ text: item.en, targetLanguage: 'zh' }, new AbortController().signal)
  } catch (failure) {
    error = String(failure?.message ?? failure)
  }
  const ms = Date.now() - start
  const must = item.must ?? []
  const missing = must.filter((term) => !output.includes(term))
  rows.push({
    id: item.id,
    category: item.category,
    en: item.en,
    zh: output,
    ms,
    error,
    mustMissing: missing,
    retried: service.stats.retries > before.retries,
    degraded: service.stats.degraded > before.degraded,
    han: (output.match(HAN_CHAR) ?? []).length,
    residual: residualEnglish(output, must),
    empty: output.trim() === ''
  })
}

const durations = sorted(rows.map((row) => row.ms))
const mustRows = rows.filter((row) => (corpus.find((item) => item.id === row.id)?.must ?? []).length > 0)
const mustHits = mustRows.filter((row) => row.mustMissing.length === 0)

const summary = {
  label: options.label,
  at: new Date().toISOString(),
  model: service.activeVariant()?.id ?? null,
  items: rows.length,
  coldMs,
  totalMs: rows.reduce((sum, row) => sum + row.ms, 0),
  medianMs: percentile(durations, 0.5),
  p95Ms: percentile(durations, 0.95),
  maxMs: durations[durations.length - 1] ?? 0,
  errors: rows.filter((row) => row.error !== null).length,
  empty: rows.filter((row) => row.empty).length,
  degraded: rows.filter((row) => row.degraded).length,
  retried: rows.filter((row) => row.retried).length,
  mustTotal: mustRows.length,
  mustHit: mustHits.length,
  residual: rows.reduce((sum, row) => sum + row.residual, 0),
  stats: { ...service.stats },
  rssMb: Math.round(process.memoryUsage().rss / 1048576)
}

mkdirSync(RESULTS, { recursive: true })
const base = path.join(RESULTS, `eval-${options.label}`)
writeFileSync(`${base}.json`, `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8')

const table = [
  `# eval ${options.label}`,
  '',
  `- model: \`${summary.model}\``,
  `- items: ${summary.items} (cold ${summary.coldMs} ms, median ${summary.medianMs} ms, p95 ${summary.p95Ms} ms)`,
  `- identifier hits: ${summary.mustHit}/${summary.mustTotal}`,
  `- degraded: ${summary.degraded}, retried: ${summary.retried}, errors: ${summary.errors}, empty: ${summary.empty}`,
  `- residual English words: ${summary.residual}`,
  '',
  '| id | ms | deg | retry | han | res | en | zh |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |'
]
for (const row of rows) {
  table.push(
    `| ${row.id} | ${row.ms} | ${row.degraded ? 'Y' : ''} | ${row.retried ? 'Y' : ''} | ${row.han} | ${row.residual} | ${row.en.replace(/\|/g, '\\|')} | ${row.zh.replace(/\|/g, '\\|')} |`
  )
}
writeFileSync(`${base}.md`, `${table.join('\n')}\n`, 'utf8')

console.log('EVAL', JSON.stringify(summary))
console.log('WROTE', `${base}.json`, `${base}.md`)

await ctx.stop?.()
const drainStart = Date.now()
while (service.outstanding.size > 0 && Date.now() - drainStart < 8000) {
  await new Promise((resolve) => setTimeout(resolve, 25))
}
console.log('DRAINED_MS', Date.now() - drainStart)
await new Promise((resolve) => setTimeout(resolve, 300))
process.exit(0)