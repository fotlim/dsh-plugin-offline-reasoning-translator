/**
 * Model catalog and downloader.
 *
 * Layout: `<modelsDir>/<variantId>/Xenova/opus-mt-en-zh/<file>`. Each variant
 * owns a full directory instead of sharing one, because `env.localModelPath`
 * is a single directory per pipeline load — one root per precision keeps the
 * worker's configuration a plain string, and swapping precision is a directory
 * change rather than a file mix-up.
 *
 * Every large file is pinned by revision and SHA-256: a translated sentence is
 * worthless if the weights silently change upstream.
 */

import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REPO_PATH = 'Xenova/opus-mt-en-zh'
/** Small catalog, read once at construction, so a sync read is the honest API. */
const CATALOG_FILE = 'models.json'

/** @returns {{defaultId: string, endpoints: string[], revision: string, models: object[]}} */
export function loadCatalog(packageRoot) {
  return JSON.parse(readFileSync(path.join(packageRoot, CATALOG_FILE), 'utf8'))
}

/**
 * Directory holding one variant's weights.
 * @param {string} modelsDir - plugin `models/` directory.
 * @param {string} variantId - e.g. `opus-mt-en-zh-q8`.
 */
export function variantRoot(modelsDir, variantId) {
  return path.join(modelsDir, variantId)
}

/** Directory passed to `env.localModelPath`, i.e. the parent of `Xenova/...`. */
export function pipelineRoot(modelsDir, variantId) {
  return variantRoot(modelsDir, variantId)
}

/**
 * Directory actually holding the weights: `localModelPath` + `Xenova/opus-mt-en-zh`,
 * which is where transformers.js resolves `pipeline(..., 'Xenova/opus-mt-en-zh')`.
 */
export function repoRoot(modelsDir, variantId) {
  return path.join(pipelineRoot(modelsDir, variantId), ...REPO_PATH.split('/'))
}

/** Every file of a variant with its expected size and hash. */
export function variantFiles(catalog, variant) {
  const files = []
  for (const [name, meta] of Object.entries(catalog.shared)) {
    files.push({ path: name, size: meta.size, sha256: meta.sha256 ?? null, shared: true })
  }
  for (const [name, meta] of Object.entries(variant.files)) {
    files.push({ path: name, size: meta.size, sha256: meta.sha256 ?? null, shared: false })
  }
  return files
}

export function totalBytes(catalog, variant) {
  return variantFiles(catalog, variant).reduce((sum, file) => sum + file.size, 0)
}

async function sizeOf(file) {
  try {
    return (await stat(file)).size
  } catch {
    return -1
  }
}

/**
 * Blocking twin of {@link inspectVariant}, for call sites that cannot await —
 * the first spawn of the translation worker answers a synchronous caller.
 * @returns {{installed: boolean, presentBytes: number, totalBytes: number}}
 */
export function inspectVariantSync(catalog, modelsDir, variant) {
  const root = repoRoot(modelsDir, variant.id)
  let presentBytes = 0
  let installed = true
  for (const file of variantFiles(catalog, variant)) {
    let size = -1
    try {
      size = statSync(path.join(root, path.join(...file.path.split('/')))).size
    } catch {}
    if (size === file.size) presentBytes += file.size
    else installed = false
  }
  return { installed, presentBytes, totalBytes: totalBytes(catalog, variant) }
}

/**
 * Installed = every file present at its exact size. Sizes come from the pinned
 * revision, so a partial or truncated download never counts as installed.
 * @returns {Promise<{installed: boolean, presentBytes: number, totalBytes: number}>}
 */
export async function inspectVariant(catalog, modelsDir, variant) {
  const root = repoRoot(modelsDir, variant.id)
  let presentBytes = 0
  let installed = true
  for (const file of variantFiles(catalog, variant)) {
    const size = await sizeOf(path.join(root, path.join(...file.path.split('/'))))
    if (size === file.size) presentBytes += file.size
    else installed = false
  }
  return { installed, presentBytes, totalBytes: totalBytes(catalog, variant) }
}

async function sha256File(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

/**
 * Download one file with resume support.
 *
 * The first endpoint measured unusable from this machine (`huggingface.co`
 * failed every Node `fetch` in Phase 0, `hf-mirror.com` worked), so the catalog
 * carries an ordered endpoint list and the caller reports which one served the
 * bytes.
 */
async function fetchToFile({ url, target, size, onProgress, signal }) {
  const partFile = `${target}.part`
  let offset = Math.max(0, await sizeOf(partFile))
  if (offset > size) {
    await rm(partFile, { force: true })
    offset = 0
  }
  if (offset === size) {
    await rename(partFile, target)
    return { resumed: offset }
  }
  const headers = offset > 0 ? { Range: `bytes=${offset}-` } : {}
  const response = await fetch(url, { headers, signal, redirect: 'follow' })
  if (!response.ok && response.status !== 206) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  if (response.status === 200 && offset > 0) {
    // The server ignored Range: start over rather than append a whole body.
    offset = 0
  }
  const handle = await open(partFile, offset > 0 ? 'r+' : 'w')
  try {
    const body = response.body
    let written = offset
    for await (const chunk of body) {
      await handle.write(chunk, 0, chunk.length, written)
      written += chunk.length
      onProgress?.(written)
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  const finalSize = await sizeOf(partFile)
  if (finalSize !== size) {
    throw new Error(`size mismatch for ${target}: got ${finalSize}, expected ${size}`)
  }
  await rename(partFile, target)
  return { resumed: offset }
}

/**
 * Download a variant, file by file, verifying hashes.
 *
 * @param options.catalog - parsed `models.json`.
 * @param options.modelsDir - plugin `models/` directory.
 * @param options.variant - catalog entry.
 * @param options.endpoints - ordered base URLs.
 * @param options.revision - pinned commit.
 * @param options.onProgress - `({doneBytes, totalBytes, file, endpoint, phase})`.
 * @param options.signal - abort signal.
 */
export async function downloadVariant({
  catalog,
  modelsDir,
  variant,
  endpoints,
  revision,
  onProgress,
  signal
}) {
  const root = repoRoot(modelsDir, variant.id)
  const files = variantFiles(catalog, variant)
  const total = files.reduce((sum, file) => sum + file.size, 0)
  let doneBytes = 0
  // A file may already be complete; count it before the loop so progress starts
  // where the disk already is.
  for (const file of files) {
    const target = path.join(root, path.join(...file.path.split('/')))
    if ((await sizeOf(target)) === file.size) doneBytes += file.size
  }

  for (const file of files) {
    signal?.throwIfAborted?.()
    const target = path.join(root, path.join(...file.path.split('/')))
    await mkdir(path.dirname(target), { recursive: true })
    const existing = await sizeOf(target)
    if (existing === file.size) {
      if (file.sha256 !== null && (await sha256File(target)) !== file.sha256) {
        await rm(target, { force: true })
      } else {
        onProgress?.({ doneBytes, totalBytes: total, file: file.path, endpoint: null, phase: 'skip' })
        continue
      }
    }
    let lastError
    let downloaded = false
    for (const endpoint of endpoints) {
      const url = `${endpoint}/${REPO_PATH}/resolve/${revision}/${file.path}`
      try {
        const startFrom = doneBytes
        await fetchToFile({
          url,
          target,
          size: file.size,
          signal,
          onProgress: (written) => {
            onProgress?.({
              doneBytes: startFrom + written,
              totalBytes: total,
              file: file.path,
              endpoint,
              phase: 'download'
            })
          }
        })
        downloaded = true
        onProgress?.({ doneBytes: doneBytes + file.size, totalBytes: total, file: file.path, endpoint, phase: 'verify' })
        if (file.sha256 !== null) {
          const digest = await sha256File(target)
          if (digest !== file.sha256) {
            await rm(target, { force: true })
            throw new Error(`checksum mismatch for ${file.path}`)
          }
        }
        doneBytes += file.size
        break
      } catch (error) {
        if (signal?.aborted) throw error
        lastError = error
      }
    }
    if (!downloaded) throw lastError ?? new Error(`could not download ${file.path}`)
  }

  const manifest = {
    variant: variant.id,
    repo: REPO_PATH,
    revision,
    license: variant.license,
    dtype: variant.dtype,
    files: files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 })),
    bytes: total,
    installedAt: new Date().toISOString()
  }
  await writeFile(path.join(root, 'model-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  onProgress?.({ doneBytes: total, totalBytes: total, file: null, endpoint: null, phase: 'done' })
  return manifest
}

/** Remove one variant's weights, leaving the bundled one alone. */
export async function removeVariant(modelsDir, variantId) {
  await rm(variantRoot(modelsDir, variantId), { recursive: true, force: true })
}

/** Read back the manifest written at install time, for the settings surface. */
export async function readManifest(modelsDir, variantId) {
  try {
    const text = await readFile(path.join(repoRoot(modelsDir, variantId), 'model-manifest.json'), 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}
