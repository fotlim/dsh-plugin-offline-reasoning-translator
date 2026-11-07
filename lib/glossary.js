/**
 * Terminology handling for a small NMT model.
 *
 * Two tiers, because the two kinds of term fail differently, and because
 * masking is not free:
 *
 * 1. **Identifiers** (`grep`, `BLEU`, `tokenizer`, `JSON`, `pnpm`) must reach
 *    the output untouched. Measured failures: `grep` → 「尖叫」, `BLEU` →
 *    「百老汇分数」, `tokenizer` → 「代号器」. These are masked as placeholders,
 *    so the model never sees the word as free text and cannot paraphrase it.
 *
 * 2. **Concepts** (`edge case`, `race condition`, `thread pool`) already have a
 *    decent Chinese rendering from the model; only a few come out wrong. Masking
 *    them measured *worse*: with three or more placeholders in one sentence the
 *    model reorders or repeats whole clauses
 *    (`...事件循环之间的一个工作线程和事件循环。`). So concepts stay in the source
 *    and are repaired on the Chinese side, and only mistranslations that were
 *    actually observed in a bench run get a repair entry.
 */

/** Terms that must appear verbatim in the target text; masked before inference. */
export const IDENTIFIER_TERMS = Object.freeze({
  // tools and runtimes
  grep: 'grep',
  egrep: 'egrep',
  ripgrep: 'ripgrep',
  awk: 'awk',
  sed: 'sed',
  curl: 'curl',
  git: 'git',
  npm: 'npm',
  pnpm: 'pnpm',
  npx: 'npx',
  node: 'Node.js',
  deno: 'Deno',
  python: 'Python',
  rust: 'Rust',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  // formats and protocols
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  csv: 'CSV',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  graphql: 'GraphQL',
  http: 'HTTP',
  https: 'HTTPS',
  tcp: 'TCP',
  udp: 'UDP',
  dns: 'DNS',
  // interfaces
  api: 'API',
  sdk: 'SDK',
  cli: 'CLI',
  gui: 'GUI',
  ui: 'UI',
  ux: 'UX',
  // hardware and inference
  cpu: 'CPU',
  gpu: 'GPU',
  tpu: 'TPU',
  onnx: 'ONNX',
  llm: 'LLM',
  rag: 'RAG',
  wasm: 'WASM',
  // model/ML vocabulary whose Chinese rendering the model gets wrong
  bleu: 'BLEU',
  rouge: 'ROUGE',
  comet: 'COMET',
  perplexity: 'perplexity',
  tokenizer: 'tokenizer',
  tokenizers: 'tokenizer',
  tokenization: 'tokenization',
  embedding: 'embedding',
  embeddings: 'embedding',
  prompt: 'prompt',
  prompts: 'prompt',
  logits: 'logits',
  softmax: 'softmax',
  checkpoint: 'checkpoint',
  quantization: 'quantization',
  // tensor dtypes: the plugin's own settings text names them, and the model
  // otherwise renders `dtype` as 「d类型」 and leaves `q8` bare
  dtype: 'dtype',
  q8: 'q8',
  q4: 'q4',
  fp16: 'fp16',
  fp32: 'fp32',
  int8: 'int8',
  // git vocabulary that must stay recognizable
  rebase: 'rebase',
  'pull request': 'pull request',
  'pull requests': 'pull request'
})

/**
 * Terms whose placeholder protection is always on and which the settings UI
 * groups as "never translate". Kept as a list rather than a flag per entry so
 * the UI copy can stay honest about what is protected.
 */
export const SAFE_IDENTIFIERS = Object.freeze(['grep', 'bleu', 'json', 'yaml', 'tokenizer', 'embedding', 'prompt', 'onnx'])

/**
 * Observed Chinese mistranslations of concept terms, mapped to the accepted
 * rendering. Only entries that were actually seen in a bench run belong here:
 * a wrong repair costs more than a missing one, because it rewrites text the
 * model already got right.
 */
export const CONCEPT_REPAIRS = Object.freeze({
  // edge case family
  边缘情况: '边界情况',
  边缘案例: '边界情况',
  边审案件: '边界情况',
  边际案件: '边界情况',
  // concurrency
  种族状况: '竞态条件',
  种族条件: '竞态条件',
  竞争状况: '竞态条件',
  工人的线条: '工作线程',
  工人线: '工作线程',
  工人线程: '工作线程',
  // `worker` on its own, which the model renders as 「工人」 (a labourer).
  // Unambiguous inside code reasoning, where there is no other kind of worker.
  工人: '工作线程',
  事件的循环: '事件循环',
  事件环: '事件循环',
  工作线程共享无内存: '工作线程不共享内存',
  // memory and GC
  垃圾收集: '垃圾回收',
  内存泄灟: '内存泄漏',
  泄漏内存: '内存泄漏',
  每批后: '每批之后',
  // injection and middleware
  依赖注射: '依赖注入',
  注射容器: '注入容器',
  中间器械: '中间件',
  中间的机器: '中间件',
  // typing
  类型推论: '类型推断',
  源地图: '源映射',
  // review and change
  拉动请求: '拉取请求',
  拉拖请求: '拉取请求',
  拆迁土地: '破坏性变更',
  破坏变化: '破坏性变更',
  冲破土地变换: '破坏性变更',
  突破性的变化: '破坏性变更',
  // serialization and throughput
  分级化: '序列化',
  输送量: '吞吐量',
  吞吐率: '吞吐量',
  输送率: '吞吐量',
  // data structures and iteration
  传动器: '迭代器',
  散列表: '哈希表',
  散列: '哈希',
  封闭点: '闭包',
  闭环: '闭包',
  线索池: '线程池',
  工作池: '线程池',
  往返飞行: '往返',
  // startup and pipelines
  冷冻启动: '冷启动',
  冷起动: '冷启动',
  暖和输油管: '预热流水线',
  输油管: '流水线',
  // `boot` rendered as a shoe, `abort` as a medical term
  靴子: '启动',
  堕胎: '中止',
  // `weights` rendered as physical mass
  重量: '权重',
  // `quantized` rendered as a biology term
  受精: '量化',
  // `calls` rendered as dialling a telephone
  拨打: '调用',
  // boilerplate
  样板盘: '样板代码',
  锅炉板: '样板代码',
  // retry and replay
  重播事件: '重放事件',
  重审的请求: '重试的请求',
  重新审理的请求: '重试的请求',
  重新装置: '重构',
  重新装进: '重构进'
})

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build mask matchers, longest term first so `pull request` wins over `request`.
 * @param {Record<string, string>} glossary - term → replacement.
 * @returns {{pattern: RegExp, replacement: string}[]}
 */
export function glossaryMatchers(glossary) {
  const terms = Object.keys(glossary).filter((term) => term.trim() !== '')
  terms.sort((left, right) => right.length - left.length)
  return terms.map((term) => ({
    // Word boundaries keep `ui` out of `build` and `prompt` out of `prompting`.
    pattern: new RegExp(`(?<![\\w-])${escapeRegExp(term)}(?![\\w-])`, 'gi'),
    replacement: glossary[term]
  }))
}

/**
 * Merge user terms over the built-in identifiers; user entries win.
 * @param {Record<string, string> | undefined} overrides - user terms.
 * @returns {Record<string, string>}
 */
export function resolveGlossary(overrides) {
  return overrides === undefined ? { ...IDENTIFIER_TERMS } : { ...IDENTIFIER_TERMS, ...overrides }
}

/**
 * Repair observed Chinese mistranslations, longest phrase first so a whole
 * clause mapping wins over its parts.
 * @param {string} text - translated text after placeholder restoration.
 * @param {Record<string, string> | undefined} repairs - overrides for the built-in table.
 * @returns {string}
 */
export function repairConcepts(text, repairs) {
  if (typeof text !== 'string' || text === '') return text
  const table = repairs === undefined ? CONCEPT_REPAIRS : { ...CONCEPT_REPAIRS, ...repairs }
  const keys = Object.keys(table).sort((left, right) => right.length - left.length)
  let output = text
  for (const key of keys) output = output.replace(new RegExp(escapeRegExp(key), 'g'), table[key])
  return output
}