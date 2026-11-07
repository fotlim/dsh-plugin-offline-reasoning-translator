import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

/**
 * Local inference worker. Loads one Marian model with onnxruntime-node inside
 * this thread so the synchronous native call never blocks the Host event loop.
 * Protocol: {id, op: 'translate', text, targetLanguage, options?} →
 *           {id, ok: true, text} | {id, ok: false, error}
 */

let pipelinePromise

async function loadPipeline() {
  const { env, pipeline } = await import('@huggingface/transformers')
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.useBrowserCache = false
  // localModelPath must point at the directory that CONTAINS `Xenova/...`
  env.localModelPath = path.join(workerData.modelRoot, path.sep)
  return pipeline(workerData.pipeline, workerData.modelId, {
    dtype: workerData.dtype,
    device: 'cpu'
  })
}

/**
 * Generation options that keep the decoder out of repetition loops.
 *
 * `no_repeat_ngram_size` is the load-bearing one: without it the quantized
 * Marian decoder answers long input with `皮尔斯皮尔斯皮尔斯…`. The token budget
 * is derived from the input instead of being a fixed 512, because a fixed high
 * budget only gives a looping decoder more room to loop.
 *
 * @param text - the source sentence.
 */
function generationOptions(text) {
  const words = typeof text === 'string' ? text.split(/\s+/).filter((word) => word !== '').length : 0
  const budget = Math.min(256, Math.max(48, words * 4 + 24))
  return {
    max_new_tokens: budget,
    no_repeat_ngram_size: 4,
    repetition_penalty: 1.15,
    num_beams: 1
  }
}

/**
 * Translate one piece, optionally overriding part of the generation options.
 *
 * The override is how the Host spends its single repair attempt: the same input
 * is pushed through with a blunter repetition guard instead of paying for a
 * second model load.
 *
 * @param translator - the loaded pipeline.
 * @param text - source piece.
 * @param override - partial generation options, merged over the defaults.
 */
function translateWith(translator, text, override) {
  const options = override === undefined ? generationOptions(text) : { ...generationOptions(text), ...override }
  return translator(text, options).then((out) => out[0].translation_text)
}

parentPort.on('message', async (message) => {
  if (message.op === 'warmup') {
    try {
      pipelinePromise ??= loadPipeline()
      await pipelinePromise
      parentPort.postMessage({ id: message.id, ok: true, text: '' })
    } catch (error) {
      parentPort.postMessage({ id: message.id, ok: false, error: String(error?.message ?? error) })
    }
    return
  }
  if (message.op !== 'translate') return
  try {
    pipelinePromise ??= loadPipeline()
    const translator = await pipelinePromise
    const text = await translateWith(translator, message.text, message.options)
    parentPort.postMessage({ id: message.id, ok: true, text })
  } catch (error) {
    parentPort.postMessage({ id: message.id, ok: false, error: String(error?.message ?? error) })
  }
})
