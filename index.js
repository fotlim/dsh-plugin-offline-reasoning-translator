import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import Schema from '@deepseek-ai/schemastery'

import { mask, unmaskDetailed } from './lib/mask.js'
import { repairConcepts, resolveGlossary } from './lib/glossary.js'
import { postprocess } from './lib/postprocess.js'
import { assess, RETRY_GENERATION } from './lib/quality.js'
import { needsTranslation } from './lib/language.js'
import { normalizeSource } from './lib/normalize.js'
import { splitForTranslation } from './lib/segment.js'
import {
  downloadVariant,
  inspectVariant,
  inspectVariantSync,
  loadCatalog,
  pipelineRoot,
  removeVariant,
  totalBytes
} from './lib/models.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const SERVICE_KEY = 'offlineReasoningTranslator'
const DEFAULT_MODEL_ID = 'Xenova/opus-mt-en-zh'
const CACHE_LIMIT = 5000
/** Upper bound on waiting for in-flight native calls before abandoning a worker. */
const DRAIN_TIMEOUT_MS = 5000

/**
 * Where downloaded weights live when the user has not redirected them.
 *
 * `HERE/models` is honoured when it already holds weights so an unpacked source
 * checkout (and the development loop in this repository) keeps working without
 * re-downloading; an installed package never contains that directory any more.
 */
function defaultModelsRoot(packageRoot) {
  const local = path.join(packageRoot, 'models')
  try {
    if (existsSync(local)) return local
  } catch {}
  return path.join(os.homedir(), '.dsh-offline-reasoning-translator', 'models')
}

/**
 * Bounded insertion-ordered cache; the oldest entry is evicted first.
 */
class LruCache {
  constructor(limit) {
    this.limit = limit
    this.map = new Map()
  }
  get(key) {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value)
  }
  get size() {
    return this.map.size
  }
  /** Drop every entry: a settings change invalidates all of them at once. */
  clear() {
    this.map.clear()
  }
}

/**
 * Read one resolved Config field.
 *
 * A `volatile()` field is not the value: schemastery resolves the entry config
 * into a frozen holder whose `get()` returns the current snapshot, so reading
 * `config.glossary` directly yields `{}`. Taking it at face value silently
 * disabled both text knobs — the panel showed `"glossary":{}` and any
 * `typeof x === 'string'` guard failed.
 *
 * @param value - a plain value or a volatile holder.
 * @param fallback - returned when the field is absent or unresolved.
 */
function readField(value, fallback) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    const resolved = value.get()
    return resolved === undefined ? fallback : resolved
  }
  return value === undefined ? fallback : value
}

/**
 * Host-side local translation service. Exposes cancellable Remote methods to the
 * reasoning view and keeps all inference inside a worker thread, so the
 * synchronous ONNX call never stalls the Host event loop.
 *
 * State lives in ordinary properties, never `#private` fields: Cordis hands
 * Remote callers a Proxy of this instance, and private fields are not readable
 * through a proxy receiver (verified the hard way: `Cannot read private member
 * #cache from an object whose class did not declare it`).
 */
/**
 * Parse the user's glossary field: `term=译法` pairs separated by newlines or
 * commas. A bare term with no `=` is protected but left untranslated, which is
 * what a user wants for a product name they typed without a mapping.
 * @param {string | undefined} raw - the raw config string.
 * @returns {Record<string, string> | undefined}
 */
function parseGlossaryOverrides(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const overrides = {}
  for (const entry of raw.split(/[\n,;]+/)) {
    const trimmed = entry.trim()
    if (trimmed === '') continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) overrides[trimmed] = trimmed
    else overrides[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim() || trimmed
  }
  return Object.keys(overrides).length === 0 ? undefined : overrides
}

/**
 * Read the panel's saved settings.
 *
 * The panel writes beside the weights rather than into the loader entry, so a
 * user who installed this package from npm can still change the model and the
 * glossary without editing a composition file. Anything unreadable or malformed
 * is ignored: the loader Config stays the fallback, so a corrupt file degrades
 * to the shipped defaults instead of failing the plugin.
 *
 * @param {string} file - absolute settings path.
 * @returns {{modelId?: string, glossary?: string, repair?: boolean}}
 */
function readSettings(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return {}
    const settings = {}
    if (typeof parsed.modelId === 'string' && parsed.modelId !== '') settings.modelId = parsed.modelId
    if (typeof parsed.glossary === 'string') settings.glossary = parsed.glossary
    if (typeof parsed.repair === 'boolean') settings.repair = parsed.repair
    return settings
  } catch {
    return {}
  }
}

/**
 * Persist settings atomically: a partially written file would otherwise be read
 * as defaults on the next boot, silently dropping what the user typed.
 * @param {string} file - absolute settings path.
 * @param {object} settings - the full settings object to store.
 */
function writeSettings(file, settings) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

export default class OfflineReasoningTranslator extends TypertRemoteService {
  static inject = ['typert']

  /**
   * Settings form on this bundle's page in the plugin manager.
   *
   * `modelId` is not volatile: switching precision must rebuild the worker, and a
   * reload is the only way to guarantee the old weights are not still resident.
   * The two text knobs are volatile — they are read on every call, and a change
   * should not restart anything (the worker is spawned lazily anyway).
   */
  static Config = Schema.object({
    modelId: Schema.string()
      .description('Model variant to load. Download other variants from this plugin page first.')
      .default('opus-mt-en-zh-q8'),
    glossary: Schema.string()
      .description('Extra protected terms, one per line or comma separated. Use `term=译法` to pin a rendering.')
      .default('')
      .volatile(),
    repair: Schema.boolean()
      .description('Repair known mistranslations of technical terms on the Chinese side.')
      .default(true)
      .volatile()
  })

  cache = new LruCache(CACHE_LIMIT)
  worker = undefined
  pending = new Map()
  /** Ids the worker still has to answer, including calls whose caller gave up. */
  outstanding = new Set()
  nextId = 1
  stats = { requests: 0, hits: 0, failures: 0, fragments: 0, degraded: 0, retries: 0, skipped: 0 }
  /** Live download state, surfaced by {@link modelStatus}. */
  transfer = { id: null, phase: 'idle', doneBytes: 0, totalBytes: 0, file: null, endpoint: null, error: null }
  downloadController = undefined

  constructor(ctx, config) {
    super(ctx, SERVICE_KEY, { namespace: SERVICE_KEY })
    this.config = config ?? {}
    this.catalog = loadCatalog(HERE)
    // Weights are not shipped inside the package: they are downloaded on first
    // use. They therefore live in a user-writable directory instead of the
    // installed package footprint, which is read-only in a pnpm store and is
    // replaced wholesale on upgrade.
    this.modelsDir = process.env.DSH_OFFLINE_TRANSLATOR_MODEL_ROOT ?? defaultModelsRoot(HERE)
    // Panel-written settings live beside the weights and win over the loader
    // Config, so the sidebar panel stays authoritative for the user who never
    // opens the composition file.
    this.settingsPath = path.join(this.modelsDir, 'settings.json')
    // Stored under a distinct name: a `settings` instance field would shadow the
    // `settings` Remote method of the same name on the prototype.
    this.savedSettings = readSettings(this.settingsPath)
    // The worker spawns on the first fragment that needs translation: a session
    // whose reasoning is never expanded pays neither the cold load nor the
    // model's resident memory. Teardown drains in-flight native calls first,
    // because terminating the worker mid-inference crashes the Host process.
    ctx.effect(() => () => {
      this.downloadController?.abort()
      this.disposeWorker()
    })
  }

  /**
   * The settings actually in force: panel-saved values first, then the loader
   * Config, then the catalog's own default. One place, so the panel, the
   * translation path and `status` can never disagree.
   */
  effectiveSettings() {
    return {
      modelId: this.savedSettings.modelId ?? readField(this.config.modelId, this.catalog.default),
      glossary: this.savedSettings.glossary ?? readField(this.config.glossary, ''),
      repair: this.savedSettings.repair ?? readField(this.config.repair, true)
    }
  }

  /** The catalog entry the service is currently configured to use. */
  activeVariant() {
    const wanted = this.effectiveSettings().modelId
    return this.catalog.models.find((model) => model.id === wanted) ?? this.catalog.models.find((model) => model.id === this.catalog.default)
  }

  /**
   * Translate one already-complete fragment.
   *
   * The fragment is cut into sentences first: this model degrades into a
   * repetition loop on paragraph-sized input, and translating sentence by
   * sentence was the only variant that stayed clean on the same text.
   *
   * @param request - `{ text, targetLanguage?, sessionId? }`; only `text` matters.
   * @param signal - caller cancellation.
   * @returns translated text with masked spans restored.
   */
  async translate(request, signal) {
    signal?.throwIfAborted?.()
    const text = typeof request?.text === 'string' ? request.text : ''
    if (text.trim() === '') return ''
    const targetLanguage = request?.targetLanguage ?? 'zh'
    const effective = this.effectiveSettings()
    // The cache key carries everything that changes the output: switching the
    // model or editing the glossary must not serve a stale sentence.
    const key = createHash('sha256')
      .update(
        [targetLanguage, effective.modelId, effective.repair ? 'repair' : 'raw', effective.glossary, text].join('\u0000')
      )
      .digest('hex')
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      this.stats.hits += 1
      return cached
    }
    this.stats.requests += 1
    const options = { glossary: resolveGlossary(parseGlossaryOverrides(effective.glossary)), repair: effective.repair }
    try {
      // Correct the source before slicing it: unwrapping a fixed-column wrap is
      // what lets a wrapped paragraph translate as one context instead of as
      // many unconnected fragments.
      const pieces = splitForTranslation(normalizeSource(text))
      const parts = []
      for (const piece of pieces) {
        const translated = await this.translatePiece(piece.text, targetLanguage, signal, options)
        parts.push(translated + piece.sep)
      }
      const restored = postprocess(parts.join(''))
      this.cache.set(key, restored)
      return restored
    } catch (error) {
      signal?.throwIfAborted?.()
      // A RemoteError already carries an actionable code (for example
      // `model-not-installed`); rewriting it as a generic failure would hide the
      // one hint the reader needs.
      if (error?.isDSHRemoteError === true) throw error
      this.stats.failures += 1
      throw new RemoteError(`${SERVICE_KEY}/failed`, 'Local translation failed', {
        cause: String(error?.message ?? error)
      })
    }
  }

  /**
   * Translate one sentence, with one automatic repair attempt.
   *
   * Four steps matter for quality, in this order: mask identifiers the model
   * would otherwise mangle, translate, judge the output, then restore the
   * spans and repair the mistranslations the model reliably produces.
   *
   * The judgement runs on the model's own output before unmasking — a restored
   * URL or a `=====` divider is legitimate text that would otherwise look like
   * a loop, and every masked span is a `<<n>>` placeholder at this point.
   *
   * A failed judgement buys exactly one retry at `RETRY_GENERATION`: blunter
   * repetition guards on the same input. That is cheap (one more decode of one
   * sentence, no model load) and it recovers the common case where the first
   * pass loops but the input was fine. A second failure keeps the English
   * sentence, because a loop on screen is worse than untranslated text.
   *
   * @param text - one sentence without its trailing separator.
   * @param targetLanguage - BCP 47 target language.
   * @param signal - caller cancellation.
   * @param options - `{ glossary, repair }` resolved once per request.
   * @returns the Chinese sentence, or the original when the model looped twice.
   */
  async translatePiece(text, targetLanguage, signal, options) {
    if (text.trim() === '') return text
    // The model is one-way English→Chinese. Chinese input comes back as noise
    // (`?~ ~.~.~7****`, scrambled dates), so sentences that are already Chinese
    // pass through untouched — and a mixed block still translates its English
    // sentences, because the gate runs per sentence.
    if (!needsTranslation(text)) {
      this.stats.skipped += 1
      return text
    }
    const { masked, slots } = mask(text, options.glossary)
    // Everything word-like was a span (a lone command, a path, a URL): the
    // model would only echo placeholders and pay a decode for nothing.
    if (!/[A-Za-z]/.test(masked)) {
      this.stats.skipped += 1
      return text
    }
    /**
     * A usable attempt: the output is neither degenerate nor holding a mangled
     * placeholder, and every span came back. `null` means the piece needs the
     * repair attempt.
     */
    const restoreAttempt = (raw) => {
      if (!assess(raw, text).ok) return null
      const detail = unmaskDetailed(raw, slots)
      return detail.unresolved > 0 ? null : detail.text
    }
    let restored = restoreAttempt(await this.request(masked, targetLanguage, signal))
    if (restored === null) {
      this.stats.retries += 1
      restored = restoreAttempt(await this.request(masked, targetLanguage, signal, RETRY_GENERATION))
      if (restored === null) {
        // Both attempts failed. Guessing the span would put a plausible-looking
        // identifier where a different one belongs, so the sentence stays
        // English; a loop or `<% >` debris on screen is worse than source text.
        this.stats.degraded += 1
        return text
      }
    }
    // Concept repairs run on the Chinese side: masking them instead measured
    // worse, because three or more placeholders in one sentence make the model
    // reorder or repeat clauses.
    if (options.repair) restored = repairConcepts(restored)
    restored = postprocess(restored)
    this.stats.fragments += 1
    return restored
  }

  /** Diagnostics for the settings surface and for smoke tests. */
  async status(signal) {
    signal?.throwIfAborted?.()
    const variant = this.activeVariant()
    return {
      ready: this.worker !== undefined,
      pending: this.pending.size,
      cacheSize: this.cache.size,
      stats: { ...this.stats },
      model: variant?.id ?? null,
      modelInstalled: variant === undefined ? false : (await inspectVariant(this.catalog, this.modelsDir, variant)).installed,
      modelsDir: this.modelsDir,
      transfer: { ...this.transfer }
    }
  }

  /**
   * Every catalog variant with its install state, for the plugin's own page.
   * Read-only and cheap: `inspectVariant` only stats file sizes.
   */
  async models(signal) {
    signal?.throwIfAborted?.()
    const active = this.activeVariant()
    const entries = []
    for (const variant of this.catalog.models) {
      const state = await inspectVariant(this.catalog, this.modelsDir, variant)
      entries.push({
        id: variant.id,
        label: variant.label,
        dtype: variant.dtype,
        license: variant.license,
        bundled: variant.bundled,
        recommended: variant.recommended,
        measured: variant.measured,
        installed: state.installed,
        active: variant.id === active?.id,
        bytes: totalBytes(this.catalog, variant),
        presentBytes: state.presentBytes
      })
    }
    return { active: active?.id ?? null, endpoints: this.catalog.endpoints, models: entries, transfer: { ...this.transfer } }
  }

  /**
   * Everything the sidebar panel's settings page needs in one round trip.
   *
   * `variants` carries only what a switcher shows — install state and measured
   * latency; the full catalog stays on `models` for the plugin page.
   */
  async settings(signal) {
    signal?.throwIfAborted?.()
    const effective = this.effectiveSettings()
    const active = this.activeVariant()
    const variants = []
    for (const variant of this.catalog.models) {
      const state = await inspectVariant(this.catalog, this.modelsDir, variant)
      variants.push({
        id: variant.id,
        label: variant.label,
        dtype: variant.dtype,
        bundled: variant.bundled,
        recommended: variant.recommended === true,
        installed: state.installed,
        active: variant.id === active?.id,
        bytes: totalBytes(this.catalog, variant),
        measured: variant.measured
      })
    }
    return {
      modelId: effective.modelId,
      glossary: effective.glossary,
      repair: effective.repair,
      activeModel: active?.id ?? null,
      modelsDir: this.modelsDir,
      defaults: {
        modelId: readField(this.config.modelId, this.catalog.default),
        glossary: readField(this.config.glossary, ''),
        repair: readField(this.config.repair, true)
      },
      variants
    }
  }

  /**
   * Save the panel's settings and apply them immediately.
   *
   * A model switch drains and drops the worker: the previous weights must not
   * stay resident behind a new selection, and the next fragment pays the cold
   * load again. The cache is cleared either way, because every key carries the
   * previous model and glossary and nothing in it can be reused.
   */
  async saveSettings(request, signal) {
    signal?.throwIfAborted?.()
    const next = { ...this.savedSettings }
    if (typeof request?.modelId === 'string' && request.modelId !== '') {
      const variant = this.catalog.models.find((model) => model.id === request.modelId)
      if (variant === undefined) {
        throw new RemoteError(`${SERVICE_KEY}/unknown-model`, `Unknown model "${request.modelId}"`, {})
      }
      const state = await inspectVariant(this.catalog, this.modelsDir, variant)
      if (!state.installed) {
        throw new RemoteError(
          `${SERVICE_KEY}/model-not-installed`,
          `Model "${request.modelId}" is not downloaded yet`,
          {}
        )
      }
      next.modelId = request.modelId
    }
    if (typeof request?.glossary === 'string') next.glossary = request.glossary
    if (typeof request?.repair === 'boolean') next.repair = request.repair
    const previousModel = this.effectiveSettings().modelId
    writeSettings(this.settingsPath, next)
    this.savedSettings = next
    const switched = this.effectiveSettings().modelId !== previousModel
    this.cache.clear()
    if (switched) await this.disposeWorker()
    return this.settings(signal)
  }

  /**
   * Download one variant. Resolves when every file is verified; progress is
   * polled through {@link modelStatus} because a Remote call cannot stream.
   */
  async download(request, signal) {
    const id = typeof request?.id === 'string' ? request.id : ''
    const variant = this.catalog.models.find((model) => model.id === id)
    if (variant === undefined) {
      throw new RemoteError(`${SERVICE_KEY}/unknown-model`, `Unknown model "${id}"`, {})
    }
    if (this.downloadController !== undefined) {
      throw new RemoteError(`${SERVICE_KEY}/busy`, 'Another model download is still running', {})
    }
    const controller = new AbortController()
    this.downloadController = controller
    const onAbort = () => controller.abort()
    signal?.addEventListener?.('abort', onAbort, { once: true })
    this.transfer = { id, phase: 'starting', doneBytes: 0, totalBytes: totalBytes(this.catalog, variant), file: null, endpoint: null, error: null }
    try {
      const manifest = await downloadVariant({
        catalog: this.catalog,
        modelsDir: this.modelsDir,
        variant,
        endpoints: this.catalog.endpoints,
        revision: this.catalog.revision,
        signal: controller.signal,
        onProgress: (progress) => {
          this.transfer = {
            id,
            phase: progress.phase,
            doneBytes: progress.doneBytes,
            totalBytes: progress.totalBytes,
            file: progress.file,
            endpoint: progress.endpoint,
            error: null
          }
        }
      })
      this.transfer = { id, phase: 'done', doneBytes: manifest.bytes, totalBytes: manifest.bytes, file: null, endpoint: this.transfer.endpoint, error: null }
      return { id, bytes: manifest.bytes }
    } catch (error) {
      this.transfer = { ...this.transfer, phase: 'error', error: String(error?.message ?? error) }
      throw new RemoteError(`${SERVICE_KEY}/download-failed`, 'Model download failed', {
        cause: String(error?.message ?? error)
      })
    } finally {
      signal?.removeEventListener?.('abort', onAbort)
      this.downloadController = undefined
    }
  }

  /**
   * Remove a downloaded variant. The active one stays: deleting the weights a
   * running worker has mapped would leave it reading a hole in the disk.
   */
  async removeModel(request, signal) {
    signal?.throwIfAborted?.()
    const id = typeof request?.id === 'string' ? request.id : ''
    const variant = this.catalog.models.find((model) => model.id === id)
    if (variant === undefined) {
      throw new RemoteError(`${SERVICE_KEY}/unknown-model`, `Unknown model "${id}"`, {})
    }
    if (variant.id === this.activeVariant()?.id) {
      throw new RemoteError(`${SERVICE_KEY}/active`, `"${id}" is in use; switch the model first`, {})
    }
    await removeVariant(this.modelsDir, variant.id)
    return { id, removed: true }
  }

  /**
   * Post one piece to the worker and await its text.
   *
   * @param text - masked source piece.
   * @param targetLanguage - BCP 47 target language.
   * @param signal - caller cancellation.
   * @param override - partial generation options for this call only.
   */
  request(text, targetLanguage, signal, override) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('aborted'))
    let worker
    try {
      worker = this.ensureWorker()
    } catch (error) {
      return Promise.reject(error)
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const onAbort = () => {
        this.pending.delete(id)
        reject(signal?.reason ?? new Error('aborted'))
      }
      signal?.addEventListener?.('abort', onAbort, { once: true })
      this.outstanding.add(id)
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener?.('abort', onAbort)
          resolve(value)
        },
        reject: (error) => {
          signal?.removeEventListener?.('abort', onAbort)
          reject(error)
        }
      })
      worker.postMessage({ id, op: 'translate', text, targetLanguage, options: override })
    })
  }

  ensureWorker() {
    if (this.worker !== undefined) return this.worker
    const variant = this.activeVariant()
    if (variant === undefined) throw new Error('no model in catalog')
    // Weights are downloaded on first use, so the very first lookup is the
    // most likely place to discover they are missing. Say so explicitly: the
    // generic failure text would be indistinguishable from a broken model.
    if (!inspectVariantSync(this.catalog, this.modelsDir, variant).installed) {
      throw new RemoteError(
        `${SERVICE_KEY}/model-not-installed`,
        `The ${variant.label} model is not downloaded yet; open the plugin panel and download it`,
        { id: variant.id }
      )
    }
    // localModelPath is the parent of `Xenova/opus-mt-en-zh`, and each precision
    // lives in its own directory, so switching model is a directory change.
    const modelRoot = pipelineRoot(this.modelsDir, variant.id)
    const worker = new Worker(new URL('./lib/worker.js', import.meta.url), {
      workerData: {
        modelRoot,
        modelId: 'Xenova/opus-mt-en-zh',
        pipeline: this.catalog.pipeline,
        dtype: variant.dtype
      }
    })
    worker.on('message', (message) => {
      this.outstanding.delete(message.id)
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.ok) entry.resolve(message.text)
      else entry.reject(new Error(message.error))
    })
    worker.on('error', (error) => {
      this.worker = undefined
      this.failAll(error, true)
    })
    worker.on('exit', (code) => {
      this.worker = undefined
      if (code !== 0) this.failAll(new Error(`translation worker exited with code ${code}`), true)
      else this.failAll(new Error('translation worker exited'), true)
    })
    this.worker = worker
    return worker
  }

  /**
   * Reject every waiting caller.
   * @param error - rejection reason.
   * @param workerGone - whether the worker itself died, so nothing is left to
   *   answer; a live worker keeps its `outstanding` ids so the dispose drain can
   *   see them (clearing them here would make the drain terminate instantly and
   *   crash mid-inference).
   */
  failAll(error, workerGone = false) {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id)
      entry.reject(error)
    }
    if (workerGone) this.outstanding.clear()
  }

  /**
   * Tear the worker down without crashing the Host.
   *
   * `worker.terminate()` while `onnxruntime-node` is inside a synchronous native
   * inference call kills the process with 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN)
   * — reproduced 3/3 by `scripts/exit-probe2.mjs`. So pending callers are failed
   * immediately, then the worker is terminated only after it has answered
   * everything it was given (an aborted caller still leaves its native call
   * running). Verified crash-free by `scripts/exit-probe3.mjs`.
   *
   * If the drain overruns DRAIN_TIMEOUT_MS the worker is left alone: it is idle
   * between calls, and the process reclaims it on exit.
   */
  disposeWorker() {
    this.failAll(new Error('service disposed'))
    const worker = this.worker
    this.worker = undefined
    if (worker === undefined) return
    const started = Date.now()
    const finish = () => {
      if (this.outstanding.size === 0) {
        worker.terminate().catch(() => {})
        return
      }
      if (Date.now() - started > DRAIN_TIMEOUT_MS) return
      const timer = setTimeout(finish, 25)
      timer.unref?.()
    }
    finish()
  }
}

// Equivalent of `@Remote translate(...)`: the decorator only writes this marker
// on the class prototype, and that marker is exactly what the Gateway reads.
Object.defineProperty(OfflineReasoningTranslator.prototype, REMOTE_METHODS, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'translate', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'status', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'models', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'download', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'removeModel', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'settings', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'saveSettings', invocation: Object.freeze({ kind: 'direct' }) })
    ])
  })
})
