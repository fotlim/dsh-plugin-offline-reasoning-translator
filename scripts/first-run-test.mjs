// First-run contract: a fresh install ships no weights, so the plugin must
// report the model as missing and refuse to translate with an actionable
// RemoteError instead of spawning a worker that would fail on a missing file.
//
// Runs against an empty model root on purpose; nothing is downloaded here.
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const emptyRoot = mkdtempSync(path.join(os.tmpdir(), 'ort-first-run-'))
process.env.DSH_OFFLINE_TRANSLATOR_MODEL_ROOT = emptyRoot

const { Context, Service } = await import('@deepseek-ai/cordis')
const { TypertRemoteService } = await import('@deepseek-ai/dsh-typert-protocol')
const { default: OfflineReasoningTranslator } = await import('../index.js')

class StubTypert extends Service {
  constructor(ctx) {
    super(ctx, 'typert')
  }
}

const ctx = new Context()
ctx.plugin(StubTypert)
ctx.plugin(OfflineReasoningTranslator)
await new Promise((resolve) => setTimeout(resolve, 50))
const service = ctx.offlineReasoningTranslator
const signal = new AbortController().signal

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`)
}

check('modelsDir follows the override', service.modelsDir === emptyRoot, service.modelsDir)

const status = await service.status(signal)
check('status reports the model as absent', status.modelInstalled === false, String(status.modelInstalled))
check('status still names the active variant', typeof status.model === 'string' && status.model.length > 0, status.model)

const catalog = await service.models(signal)
check('every variant reads as absent', catalog.models.every((model) => model.installed === false))

let code = null
try {
  await service.translate({ text: 'A sentence that needs weights.', targetLanguage: 'zh' }, signal)
} catch (error) {
  code = error?.code ?? null
}
check('translate refuses with model-not-installed', code === 'offlineReasoningTranslator/model-not-installed', String(code))
check('no worker survived the refusal', service.worker === undefined)

let activeCode = null
try {
  await service.removeModel({ id: status.model }, signal)
} catch (error) {
  activeCode = error?.code ?? null
}
check('the active variant is protected even when missing', activeCode === 'offlineReasoningTranslator/active', String(activeCode))

// A download into an empty root must produce a real directory tree, but pulling
// 108 MiB in a unit test is not acceptable: assert the planner instead.
const { inspectVariantSync, variantFiles, repoRoot } = await import('../lib/models.js')
const variant = service.catalog.models.find((model) => model.id === status.model)
const files = variantFiles(service.catalog, variant)
check('the catalog pins a file list', files.length >= 10, `files=${files.length}`)
const layout = repoRoot(emptyRoot, variant.id)
check('weights resolve under the override root', layout.startsWith(emptyRoot), layout)
check(
  'a partial tree is not installed',
  inspectVariantSync(service.catalog, emptyRoot, variant).installed === false
)

console.log(failures === 0 ? 'OK: first-run contract' : `FAILED: ${failures} check(s)`)
rmSync(emptyRoot, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)