// Client-side harness: mock window.__ModuleLoader__ and the browser requires,
// load client.js exactly as the real Web UI does, then exercise the fragment
// splitter, the ReasoningTranslation state machine and TranslationBody render.
import assert from 'node:assert/strict'

const registered = new Map()
globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      registered.set(id, factory)
    }
  }
}

// Minimal DOM for the stylesheet-injection path. A browser plugin ships CSS as a
// `<style data-plugin-css>` element, and the injection has to be idempotent
// because a reload cycle can leave the previous element in the document.
const styleElements = []
globalThis.document = {
  head: {
    append(element) {
      styleElements.push(element)
    }
  },
  createElement(tagName) {
    return { tagName, dataset: {}, textContent: '' }
  },
  querySelector(selector) {
    const match = /^style\[data-plugin-css="(.*)"\]$/.exec(selector)
    if (match === null) return null
    return styleElements.find((element) => element.dataset.pluginCss === match[1]) ?? null
  }
}

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children }, $$el: true }),
  useState: (initial) => {
    const box = { value: typeof initial === 'function' ? initial() : initial }
    return [box.value, (next) => { box.value = typeof next === 'function' ? next(box.value) : next; box.set = true }]
  },
  useRef: (initial) => ({ current: initial }),
  useEffect: (fn) => { fn() },
  useCallback: (fn) => fn,
  useMemo: (fn) => fn()
}

const jsxRuntime = {
  jsx: (type, props) => ({ type, props, $$el: true }),
  jsxs: (type, props) => ({ type, props, $$el: true }),
  Fragment: 'Fragment'
}

const requireShim = (name) => {
  if (name === 'react') return fakeReact
  if (name === 'react/jsx-runtime') return jsxRuntime
  throw new Error(`unexpected require: ${name}`)
}

await import('../client.js')
assert.equal(registered.size, 1, 'client.js must register exactly one module')
const [id, factory] = [...registered.entries()][0]
console.log('MODULE_ID', id)
const mod = factory(requireShim)
console.log('EXPORTS', Object.keys(mod).join(','))
assert.equal(typeof mod.apply, 'function')
assert.deepEqual(mod.inject, ['remote', 'slots', 'locale'])

// --- exercise apply() with a fake plugin context -------------------------
const calls = []
const mounted = []
const slotRegistrations = []
const effects = []
const ctx = {
  effect: (fn, label) => { effects.push(label ?? 'effect'); const d = fn(); return d },
  locale: { register: (ns, table) => { calls.push(['locale', ns, Object.keys(table)]) } },
  remote: {
    $mount: async (info) => { mounted.push(info); return async () => { mounted.push('unmount') } },
  },
  inject: async (deps, fn) => {
    const child = {
      locale: { getSnapshot: () => ({ active: 'zh' }), register: () => {} },
      remote: {
        offlineReasoningTranslator: {
          translate: async (request, signal) => {
            calls.push(['translate', request.text])
            return { ok: true, value: `[译]${request.text}` }
          }
        }
      },
      slots: {
        inject: (name, register) => register(),
        register: (options, component) => {
          slotRegistrations.push({ options, component })
          return { dispose: async () => { slotRegistrations.push('disposed') } }
        }
      }
    }
    return fn(child)
  }
}

const dispose = await mod.apply(ctx)
console.log('MOUNTED_REMOTE', mounted.length)
console.log('SLOT', slotRegistrations[0]?.options?.name, 'PRIORITY', slotRegistrations[0]?.options?.priority)

// Every seat this plugin takes, in registration order. A missing `main` entry
// leaves a sidebar button that opens nothing; a missing `sidebar.panellist`
// entry leaves a panel nothing can open.
const seatNames = slotRegistrations.filter((entry) => entry?.options !== undefined).map((entry) => entry.options.name)
assert.deepEqual(seatNames, [
  'conversation.chat.reasoning.body',
  'plugins.bundle.config',
  'sidebar.panellist',
  'main'
])
const seats = Object.fromEntries(
  slotRegistrations.filter((entry) => entry?.options !== undefined).map((entry) => [entry.options.name, entry])
)
// The sidebar reads the button label from our list metadata; the thunk must
// resolve through the active locale rather than a baked string.
assert.equal(typeof seats['sidebar.panellist'].options.label, 'function')
assert.equal(seats['sidebar.panellist'].options.label(), '离线翻译')
assert.equal(seats['sidebar.panellist'].options.id, seats.main.options.key)
// The glyph receives the owner's square edge and selected flag.
const glyph = seats['sidebar.panellist'].component({ size: 18, active: true })
assert.equal(glyph.type, 'svg')
assert.equal(glyph.props.width, 18)
// The panel body renders without a Host round trip having finished yet.
const PANEL_SNAPSHOT = {
  modelId: 'opus-mt-en-zh-q8',
  glossary: '',
  repair: true,
  activeModel: 'opus-mt-en-zh-q8',
  modelsDir: 'models',
  defaults: { modelId: 'opus-mt-en-zh-q8', glossary: '', repair: true },
  variants: [
    { id: 'opus-mt-en-zh-q8', label: 'q8', dtype: 'q8', installed: true, active: true, bytes: 113112546 },
    { id: 'opus-mt-en-zh-fp32', label: 'fp32', dtype: 'fp32', installed: false, active: false, bytes: 445777456 }
  ]
}
let settingsReads = 0
const panelProps = {
  models: async () => ({ ok: true, value: { active: 'opus-mt-en-zh-q8', models: [] } }),
  download: async () => ({ ok: true }),
  remove: async () => ({ ok: true }),
  status: async () => ({ ok: true, value: {} }),
  settings: async () => {
    settingsReads += 1
    return { ok: true, value: PANEL_SNAPSHOT }
  },
  saveSettings: async () => ({ ok: true, value: PANEL_SNAPSHOT }),
  t: (key) => key
}
const panel = seats.main.component(panelProps)
assert.equal(panel.props['data-offline-translation-panel'], 'offline-translation')
// The panel is the settings page, not a read-only model list: it must read its
// values through `settings` and offer the glossary editor, the repair switch
// and a save action. (Variant rows arrive on the next render, after the async
// load settles, so they are not part of this first tree.)
assert.ok(settingsReads >= 1, 'panel must load its settings through the Remote')
const flatPanel = []
const walk = (node) => {
  if (node === null || typeof node !== 'object') return
  if (node.$$el === true) flatPanel.push(node)
  const children = node.props?.children
  if (Array.isArray(children)) children.forEach(walk)
  else walk(children)
}
walk(panel)
const panelTags = flatPanel.map((node) => (typeof node.type === 'string' ? node.type : `fn:${node.type.name}`))
assert.ok(panelTags.includes('textarea'), 'panel must expose the glossary editor')
assert.ok(panelTags.includes('input'), 'panel must expose the repair switch')
assert.ok(panelTags.filter((tag) => tag === 'button').length >= 1, 'panel must expose a save action')
console.log('PANEL_TAGS', panelTags.join(','))

// --- stylesheet ------------------------------------------------------------
assert.equal(styleElements.length, 1, 'the panel must inject its stylesheet')
const css = styleElements[0].textContent
assert.equal(styleElements[0].dataset.pluginCss.endsWith('/panel.css'), true)
assert.ok(css.includes('.ortl-page'), 'stylesheet must carry the page shell')
assert.ok(css.includes('.ortl-btn'), 'buttons must be styled, not left as UA defaults')
assert.ok(css.includes(':focus-visible'), 'keyboard focus must stay visible')
// Rendering again must reuse the element instead of stacking copies.
seats.main.component(panelProps)
assert.equal(styleElements.length, 1, 'stylesheet injection must be idempotent')
// Only documented theme tokens exist. A misspelled token does not fail loudly:
// `var(--missing)` makes the declaration invalid at computed-value time, so
// borders disappear and text inherits — exactly the bug this list prevents.
const THEME_TOKENS = new Set([
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill'
])
const usedTokens = new Set([...css.matchAll(/--dsw-[a-z0-9-]+/g)].map((match) => match[0]))
for (const token of usedTokens) {
  assert.ok(THEME_TOKENS.has(token), `stylesheet references ${token}, which is not a documented theme token`)
}
console.log('STYLESHEET', styleElements[0].dataset.pluginCss, css.length, 'bytes /', usedTokens.size, 'tokens')
console.log('SEATS', seatNames.join(','))

const spec = mounted[0]
console.log('SPEC_PACKAGE', spec.package)
console.log('SPEC_METHODS', Object.keys(spec.methods).join(','))
const t = spec.methods['offlineReasoningTranslator/translate']
assert.equal(t.invocation.kind, 'direct')
assert.equal(t.parameters[0].wire, 'request')
// The client gateway reads `codec.mode` unconditionally and rejects anything
// that is not strict, so a missing codec is a mount-time crash, not a warning.
for (const [endpoint, definition] of Object.entries(spec.methods)) {
  for (const parameter of definition.parameters) {
    assert.equal(parameter.codec?.mode, 'strict', `${endpoint} ${parameter.name} needs a strict codec`)
    assert.equal(parameter.strictCodec?.mode, 'strict', `${endpoint} ${parameter.name} needs a strict strictCodec`)
    // typert-registry validateCodec: a strict codec needs a nonempty typeSymbol
    // and a create() factory, or registration throws before the mount completes.
    for (const codec of [parameter.codec, parameter.strictCodec]) {
      assert.ok(codec.typeSymbol?.length > 0, `${endpoint} ${parameter.name} needs a typeSymbol`)
      assert.equal(typeof codec.create, 'function', `${endpoint} ${parameter.name} needs create()`)
    }
  }
  assert.equal(definition.result?.mode, 'strict', `${endpoint} needs a strict result`)
  assert.ok(definition.result.typeSymbol?.length > 0, `${endpoint} result needs a typeSymbol`)
  assert.equal(typeof definition.result.create, 'function', `${endpoint} result needs create()`)
  assert.ok(definition.service?.length > 0, `${endpoint} needs a service key`)
}
console.log('CODECS strict')

// The Gateway counts arguments against the declared parameters and refuses a
// call that passes more than `parameters.length + 1` (the optional AbortSignal).
// A zero-argument method therefore has to be called with no input at all;
// passing `{}` produced `expected 0 business argument(s) plus an optional
// AbortSignal, got 2` in the panel. Pin the arity contract here.
const ARITY = {
  'offlineReasoningTranslator/translate': 1,
  'offlineReasoningTranslator/status': 0,
  'offlineReasoningTranslator/models': 0,
  'offlineReasoningTranslator/download': 1,
  'offlineReasoningTranslator/removeModel': 1,
  'offlineReasoningTranslator/settings': 0,
  'offlineReasoningTranslator/saveSettings': 1
}
for (const [endpoint, expected] of Object.entries(ARITY)) {
  const definition = spec.methods[endpoint]
  assert.ok(definition !== undefined, `${endpoint} must be declared`)
  assert.equal(definition.parameters.length, expected, `${endpoint} must declare ${expected} parameter(s)`)
}
console.log('ARITY ok')

// RemoteNamespaceService keeps its own bookkeeping methods on the same object it
// installs Remote methods on, and `assertMethodAvailable` rejects any Remote
// name that is already a member there. A colliding name fails the whole mount
// (the plugin then silently degrades), so guard the reserved set here.
const RESERVED_NAMESPACE_MEMBERS = new Set([
  'ctx',
  'empty',
  'invokeRemote',
  'methods',
  'name',
  'namespace',
  'assertMethodAvailable',
  'has',
  'install',
  'installDirect',
  'installScoped',
  'remove'
])
for (const endpoint of Object.keys(spec.methods)) {
  const method = endpoint.slice(endpoint.indexOf('/') + 1)
  assert.ok(
    !RESERVED_NAMESPACE_MEMBERS.has(method),
    `Remote method "${method}" collides with a RemoteNamespaceService member; rename it`
  )
}
console.log('METHOD_NAMES free')

// The inlined RemoteInfo.invoke must call through the namespace receiver.
const remoteProxy = {
  offlineReasoningTranslator: {
    translate: async (request, signal) => ({ ok: true, value: 'via-invoke:' + request.text })
  }
}
const invoked = await t.invoke(remoteProxy, { request: { text: 'hello' } }, new AbortController().signal)
console.log('INVOKE', invoked.value)

// --- TranslationBody render ---------------------------------------------
const component = slotRegistrations[0].component
const translated = []
const props = {
  text: 'First paragraph.\n\nSecond paragraph.',
  running: false,
  translate: async (request) => { translated.push(request.text); return `[译]${request.text}` },
  t: (key) => key,
  renderFactorySlot: (name, data) => ({ type: 'Factory', props: { name, data }, $$el: true })
}
const tree = component(props)
console.log('TREE_ATTRS', JSON.stringify({
  state: tree.props['data-translation-state'],
  view: tree.props['data-translation-view']
}))
const factorySlot = tree.props.children[1]
console.log('FACTORY_SLOT', factorySlot.props.name)
console.log('FACTORY_TEXT', JSON.stringify(factorySlot.props.data.text))
assert.equal(factorySlot.props.name, 'conversation.chat.reasoning.content')

await dispose()
console.log('DISPOSED', JSON.stringify(slotRegistrations.slice(-1)))
console.log('OK: client harness passed')
