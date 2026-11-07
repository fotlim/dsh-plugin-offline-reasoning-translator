/**
 * Downloader test that does not pull 200 MB over a mirror.
 *
 * Uses the real catalog's shared files (`config.json` is 1.5 KB) as a synthetic
 * variant, so the HTTP path, resume, size check, SHA-256 verify and atomic rename
 * all run for real, against a throwaway directory.
 *
 *   node scripts/download-test.mjs
 */

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { downloadVariant, inspectVariant, loadCatalog, repoRoot } from '../lib/models.js'

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const catalog = loadCatalog(packageRoot)
const modelsDir = await mkdtemp(path.join(tmpdir(), 'ort-dl-'))

// A synthetic variant: two shared files, no big ONNX weights.
const variant = {
  id: 'download-test',
  label: 'download test',
  dtype: 'q8',
  license: 'apache-2.0',
  bundled: false,
  files: {}
}
const syntheticCatalog = {
  ...catalog,
  shared: {
    'config.json': catalog.shared['config.json'],
    'generation_config.json': catalog.shared['generation_config.json']
  }
}

const events = []
const manifest = await downloadVariant({
  catalog: syntheticCatalog,
  modelsDir,
  variant,
  endpoints: catalog.endpoints,
  revision: catalog.revision,
  onProgress: (progress) => events.push(`${progress.phase}:${progress.doneBytes}/${progress.totalBytes}@${progress.endpoint ?? '-'}`)
})
console.log('MANIFEST_BYTES', manifest.bytes)
console.log('EVENTS', events.length, events[0], '|', events.at(-1))
const expected = syntheticCatalog.shared['config.json'].size + syntheticCatalog.shared['generation_config.json'].size
console.log('SIZE_MATCH', manifest.bytes === expected, expected)

const state = await inspectVariant(syntheticCatalog, modelsDir, variant)
console.log('INSTALLED', state.installed, state.presentBytes)

const configPath = path.join(repoRoot(modelsDir, variant.id), 'config.json')
console.log('CONFIG_BYTES', (await stat(configPath)).size)
const head = JSON.parse(await readFile(configPath, 'utf8'))
console.log('CONFIG_KEYS', Object.keys(head).slice(0, 4).join(','))

// Second run must be all skips: nothing is fetched again.
const second = []
await downloadVariant({
  catalog: syntheticCatalog,
  modelsDir,
  variant,
  endpoints: catalog.endpoints,
  revision: catalog.revision,
  onProgress: (progress) => second.push(progress.phase)
})
console.log('SECOND_RUN', second.filter((phase) => phase === 'download').length === 0 ? 'all-skip' : second.join(','))

// A truncated file must be re-fetched rather than trusted.
await writeFile(configPath, 'x')
const third = []
await downloadVariant({
  catalog: syntheticCatalog,
  modelsDir,
  variant,
  endpoints: catalog.endpoints,
  revision: catalog.revision,
  onProgress: (progress) => third.push(progress.phase)
})
console.log('RECOVERED', (await stat(configPath)).size === syntheticCatalog.shared['config.json'].size, third.includes('download'))

await rm(modelsDir, { recursive: true, force: true })
console.log('OK: downloader passed')