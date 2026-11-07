// Isolated Host-side test: mount the plugin on a real Cordis Context (with a
// stub `typert` service, since only the registry is absent here) and call the
// Remote-marked methods directly. Verifies service registration, the prototype
// Remote marker, caching, cancellation and the worker round-trip.
import { readFileSync } from 'node:fs'

import { Context, Service } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

import OfflineReasoningTranslator from '../index.js'

class StubTypert extends Service {
  constructor(ctx) {
    super(ctx, 'typert')
  }
}

const ctx = new Context()
ctx.plugin(StubTypert)

let service
ctx.plugin(OfflineReasoningTranslator)
await new Promise((resolve) => setTimeout(resolve, 50))
service = ctx.offlineReasoningTranslator
console.log('MOUNTED', service !== undefined)
console.log('NAMESPACE', JSON.stringify(service?.typertRemote?.namespace))
console.log('MARKER', JSON.stringify(remoteMethods(service).map((m) => m.method)))

const t0 = Date.now()
const first = await service.translate(
  { text: 'The tool reads the file and returns the parsed structure.', targetLanguage: 'zh' },
  new AbortController().signal
)
console.log('FIRST_MS', Date.now() - t0)
console.log('FIRST', first)

const t1 = Date.now()
const second = await service.translate(
  { text: 'The tool reads the file and returns the parsed structure.', targetLanguage: 'zh' },
  new AbortController().signal
)
console.log('CACHE_MS', Date.now() - t1, 'SAME', second === first)

const controller = new AbortController()
const pending = service.translate({ text: 'This call is aborted before it can finish.' }, controller.signal)
setTimeout(() => controller.abort(new Error('test abort')), 30)
try {
  await pending
  console.log('ABORT_FAILED (resolved instead of rejecting)')
} catch (error) {
  console.log('ABORT_OK', error?.code ?? error?.message)
}

console.log('STATUS', JSON.stringify(await service.status(new AbortController().signal)))
const catalog = await service.models(new AbortController().signal)
console.log('MODELS', JSON.stringify(catalog.models.map((m) => `${m.id}:${m.installed ? 'installed' : 'absent'}:${m.active ? 'active' : '-'}`)))
console.log('ACTIVE', catalog.active, 'BYTES', catalog.models[0].bytes, 'ENDPOINTS', catalog.endpoints.length)

// The sidebar panel reads and writes through this pair; the values must land in
// the settings file beside the weights and be refused when the model is absent.
const panel = await service.settings(new AbortController().signal)
console.log(
  'SETTINGS',
  JSON.stringify({ modelId: panel.modelId, glossary: panel.glossary, repair: panel.repair, variants: panel.variants.length })
)
const savedPanel = await service.saveSettings({ glossary: 'grep=查找\nBLEU' }, new AbortController().signal)
console.log('SAVED_GLOSSARY', JSON.stringify(savedPanel.glossary))
console.log('PERSISTED', JSON.stringify(JSON.parse(readFileSync(service.settingsPath, 'utf8'))))
let refused = 'none'
try {
  await service.saveSettings({ modelId: 'opus-mt-en-zh-fp32' }, new AbortController().signal)
} catch (error) {
  refused = error?.code ?? error?.message
}
console.log('REFUSED', refused)
await service.saveSettings({ glossary: '', repair: true }, new AbortController().signal)
console.log('RSS_MB', Math.round(process.memoryUsage().rss / 1048576))

// Teardown must let the aborted call's native inference finish: exiting the
// process (or terminating the worker) while onnxruntime is inside a native call
// ends it with 0xC0000409. disposeWorker() does the drain; wait for it.
await ctx.stop?.()
console.log('STOPPED')
const drainStart = Date.now()
while (service.outstanding.size > 0 && Date.now() - drainStart < 8000) {
  await new Promise((resolve) => setTimeout(resolve, 25))
}
console.log('DRAINED_MS', Date.now() - drainStart, 'outstanding=' + service.outstanding.size)
await new Promise((resolve) => setTimeout(resolve, 400))
console.log('EXITING')
process.exit(0)
