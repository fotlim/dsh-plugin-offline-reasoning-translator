window.__ModuleLoader__.load({
  id: 'dsh-plugin-offline-reasoning-translator',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let react = require('react')
    let jsxRuntime = require('react/jsx-runtime')

    //#region inlined typert RemoteInfo (mirrors @deepseek-ai/dsh-typert-protocol)
    // Browser bundles cannot import the Host protocol package, so the same
    // descriptor assembly is inlined here. Only the direct-invocation path is
    // implemented; the named-input zod helpers are unnecessary for this plugin.
    class RemoteInfo {
      constructor(spec) {
        this.spec = spec
        this.index = undefined
      }
      get package() {
        return this.spec.package
      }
      get descriptors() {
        return this.resolve().descriptors
      }
      get methods() {
        return this.resolve().methods
      }
      resolve() {
        if (this.index !== undefined) return this.index
        const descriptors = []
        const methods = Object.create(null)
        for (const [endpoint, definition] of Object.entries(this.spec.methods)) {
          const separator = endpoint.indexOf('/')
          const namespace = endpoint.slice(0, separator)
          const method = endpoint.slice(separator + 1)
          const parameters = definition.parameters.map((parameter) => ({
            ...parameter,
            wire: parameter.wire ?? parameter.name
          }))
          const descriptor = {
            ...definition,
            id: `${this.spec.package}#${endpoint}`,
            namespace,
            method,
            parameters
          }
          if (definition.invocation.kind === 'direct') {
            methods[endpoint] = Object.assign(descriptor, {
              invoke(remote, input, signal) {
                const named = input
                const values = parameters.map((parameter) => named[parameter.wire])
                if (definition.cancellation !== undefined) values.push(signal)
                const receiver = Reflect.get(remote, namespace)
                return Reflect.get(receiver, method).apply(receiver, values)
              }
            })
          }
          descriptors.push(descriptor)
        }
        return (this.index = { descriptors, methods })
      }
    }
    //#endregion

    //#region locales (inlined: the browser bundle has no filesystem access)
    const NS = 'offlineReasoningTranslator'
    const en = {
      'meta.title': 'Offline Reasoning Translator',
      'meta.description':
        'Translate English reasoning text into Chinese locally, without sending it to any server.',
      translating: 'Translating locally…',
      failed: 'Local translation failed',
      retry: 'Retry',
      original: 'Show original',
      translation: 'Show translation',
      copy: 'Copy code',
      copied: 'Copied',
      codeTitle: 'Code',
      wrap: 'Wrap lines',
      unwrap: 'Unwrap lines',
      footnotes: 'Footnotes',
      modelsTitle: 'Local models',
      modelsIntro: 'The bundled model works offline out of the box.',
      activeModel: 'active',
      recommended: 'recommended',
      notDownloaded: 'not downloaded',
      download: 'Download',
      downloading: 'Downloading',
      remove: 'Remove',
      sentence: 'sentence',
      panelTitle: 'Offline translation',
      panelIntro:
        'Reasoning text is translated on this machine with a bundled model, so nothing leaves the app.',
      panelHint:
        'The same settings form the plugin page shows under Settings → Plugins; changing them here writes the same file.',
      modelSection: 'Model',
      modelHint: 'Only downloaded variants can be selected. Switching drains the worker and loads the new weights on the next sentence.',
      useModel: 'Use',
      inUse: 'in use',
      translationSection: 'Translation',
      glossaryLabel: 'Extra glossary',
      glossaryHint: 'One entry per line: `term` protects it, `term=译法` pins a rendering.',
      repairLabel: 'Repair known mistranslations',
      repairHint: 'Fixes terms the model reliably gets wrong, such as edge case → 边界情况.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      unsaved: 'Unsaved changes'
    }
    const zh = {
      'meta.title': '离线思考翻译',
      'meta.description': '在本地把英文思考内容翻译成中文，不向任何服务器发送文本。',
      translating: '正在本地翻译…',
      failed: '本地翻译失败',
      retry: '重试',
      original: '看原文',
      translation: '看译文',
      copy: '复制代码',
      copied: '已复制',
      codeTitle: '代码',
      wrap: '自动换行',
      unwrap: '取消换行',
      footnotes: '脚注',
      modelsTitle: '本地模型',
      modelsIntro: '内置模型开箱即可离线使用。',
      activeModel: '使用中',
      recommended: '推荐',
      notDownloaded: '未下载',
      download: '下载',
      downloading: '下载中',
      remove: '删除',
      sentence: '句',
      panelTitle: '离线翻译',
      panelIntro: '思考内容在本机用内置模型翻译，不离开这台设备。',
      panelHint: '这里改的就是插件设置页上的同一份配置，保存后立即生效，不需要重启。',
      modelSection: '模型',
      modelHint: '只有已下载的模型可以切换。切换会先停掉当前的推理进程，下一句翻译时再加载新权重。',
      useModel: '使用',
      inUse: '使用中',
      translationSection: '翻译',
      glossaryLabel: '附加术语表',
      glossaryHint: '一行一条：只填英文词表示原样保留，写 英文=译法 可固定译法。',
      repairLabel: '修正常见误译',
      repairHint: '修正模型稳定译错的词，例如 edge case → 边界情况。',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      unsaved: '有未保存的修改'
    }
    //#endregion

    const SLOT = 'conversation.chat.reasoning.body'
    /** This bundle's own seat on its page in the plugin manager. */
    const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'
    /** Must equal `package.json#name`: the plugin manager keys the seat by it. */
    const PACKAGE_NAME = 'dsh-plugin-offline-reasoning-translator'
    const CONTENT_SLOT = 'conversation.chat.reasoning.content'
    /**
     * Global panel seats. `sidebar.panellist` owns the button (and reads our
     * `label` for it); the same id keyed into `main` renders the panel body
     * once the sidebar dispatches it. Registering only one of the two leaves a
     * button that opens nothing, or a panel nothing can open.
     */
    const PANEL_LIST_SLOT = 'sidebar.panellist'
    const MAIN_SLOT = 'main'
    const PANEL_ID = 'offline-translation'
    const MAX_TEXT_CHARS = 1200

    /**
     * The client gateway rejects any Remote parameter whose `codec.mode` is not
     * `"strict"` (`client api: generated Remote … has no strict codec`), and it
     * reads that field unconditionally — a missing codec surfaces as
     * `Cannot read properties of undefined (reading 'mode')`. `zod` is part of
     * the browser baseline table, so the schemas are real rather than stubs.
     */
    let zodRuntime
    try {
      const zodModule = require('zod')
      zodRuntime = zodModule?.z ?? zodModule
    } catch {
      zodRuntime = undefined
    }

    const TYPE_SYMBOL = 'dsh-plugin-offline-reasoning-translator/types'
    const requestCodec = () => ({
      mode: 'strict',
      typeSymbol: `${TYPE_SYMBOL}#TranslationRequest`,
      jsonSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          targetLanguage: { type: 'string' },
          sessionId: { type: 'string' }
        },
        required: ['text'],
        additionalProperties: false
      },
      create: () =>
        zodRuntime?.object({
          text: zodRuntime.string(),
          targetLanguage: zodRuntime.string().optional(),
          sessionId: zodRuntime.string().optional()
        })
    })

    /**
     * A codec for a single `{id}` request parameter.
     * @returns {{mode: 'strict', typeSymbol: string, jsonSchema: object, create: Function}}
     */
    function idCodec() {
      return {
        mode: 'strict',
        typeSymbol: `${TYPE_SYMBOL}#ModelIdRequest`,
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false
        },
        create: () => zodRuntime?.object({ id: zodRuntime.string() })
      }
    }

    /**
     * A pass-through result codec. The Host returns nested objects whose exact
     * shape is versioned with the Host package, so the browser validates nothing
     * beyond "this is an object" — a stricter schema here would reject a Host
     * that merely added a field.
     * @param {string} tag - type symbol suffix.
     * @returns {{mode: 'strict', typeSymbol: string, jsonSchema: object, create: Function}}
     */
    function anyResult(tag) {
      return {
        mode: 'strict',
        typeSymbol: `${TYPE_SYMBOL}#${tag}`,
        jsonSchema: { type: 'object', additionalProperties: true },
        create: () => zodRuntime?.unknown?.() ?? zodRuntime?.record?.(zodRuntime.string(), zodRuntime.unknown())
      }
    }

    /**
     * A codec for a request whose fields are all optional and versioned by the
     * Host. The schema documents the three known keys without rejecting a Host
     * that grows a fourth.
     * @param {string} tag - type symbol suffix.
     * @returns {{mode: 'strict', typeSymbol: string, jsonSchema: object, create: Function}}
     */
    function anyCodec(tag) {
      return {
        mode: 'strict',
        typeSymbol: `${TYPE_SYMBOL}#${tag}`,
        jsonSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string' },
            glossary: { type: 'string' },
            repair: { type: 'boolean' }
          },
          additionalProperties: true
        },
        create: () => zodRuntime?.unknown?.() ?? zodRuntime?.record?.(zodRuntime.string(), zodRuntime.unknown())
      }
    }

    /**
     * Remote specs for the model-management methods, kept in one object so the
     * whole group can be mounted or withheld while diagnosing a mount failure.
     */
    const MODEL_METHOD_DEFS = {
      models: {
        service: NS,
        description: 'List model variants with their install state.',
        invocation: { kind: 'direct' },
        parameters: [],
        cancellation: { parameter: 'signal' },
        result: anyResult('ModelCatalog')
      },
      download: {
        service: NS,
        description: 'Download and verify one model variant.',
        invocation: { kind: 'direct' },
        parameters: [
          {
            name: 'request',
            wire: 'request',
            source: 'json',
            jsonSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
              additionalProperties: false
            },
            codec: idCodec(),
            strictCodec: idCodec()
          }
        ],
        cancellation: { parameter: 'signal' },
        result: anyResult('DownloadResult')
      },
      removeModel: {
        service: NS,
        description: 'Remove a downloaded model variant.',
        invocation: { kind: 'direct' },
        parameters: [
          {
            name: 'request',
            wire: 'request',
            source: 'json',
            jsonSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
              additionalProperties: false
            },
            codec: idCodec(),
            strictCodec: idCodec()
          }
        ],
        cancellation: { parameter: 'signal' },
        result: anyResult('RemoveResult')
      },
      settings: {
        service: NS,
        description: 'Read the settings the sidebar panel edits.',
        invocation: { kind: 'direct' },
        parameters: [],
        cancellation: { parameter: 'signal' },
        result: anyResult('PanelSettings')
      },
      saveSettings: {
        service: NS,
        description: 'Save model and translation settings from the sidebar panel.',
        invocation: { kind: 'direct' },
        parameters: [
          {
            name: 'request',
            wire: 'request',
            source: 'json',
            jsonSchema: {
              type: 'object',
              properties: {
                modelId: { type: 'string' },
                glossary: { type: 'string' },
                repair: { type: 'boolean' }
              },
              additionalProperties: false
            },
            codec: anyCodec('SaveSettings'),
            strictCodec: anyCodec('SaveSettings')
          }
        ],
        cancellation: { parameter: 'signal' },
        result: anyResult('PanelSettings')
      }
    }

    const TYPERT_REMOTE = new RemoteInfo({
      package: 'dsh-plugin-offline-reasoning-translator',
      methods: {
        [`${NS}/translate`]: {
          service: NS,
          description: 'Translate one completed reasoning fragment locally.',
          invocation: { kind: 'direct' },
          parameters: [
            {
              name: 'request',
              wire: 'request',
              source: 'json',
              jsonSchema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  targetLanguage: { type: 'string' },
                  sessionId: { type: 'string' }
                },
                required: ['text'],
                additionalProperties: true
              },
              codec: requestCodec(),
              strictCodec: requestCodec()
            }
          ],
          cancellation: { parameter: 'signal' },
          result: {
            mode: 'strict',
            typeSymbol: `${TYPE_SYMBOL}#TranslatedText`,
            jsonSchema: { type: 'string' },
            create: () => zodRuntime?.string()
          }
        },
        [`${NS}/status`]: {
          service: NS,
          description: 'Report local model readiness and cache statistics.',
          invocation: { kind: 'direct' },
          parameters: [],
          cancellation: { parameter: 'signal' },
          result: {
            mode: 'strict',
            typeSymbol: `${TYPE_SYMBOL}#TranslatorStatus`,
            jsonSchema: {
              type: 'object',
              properties: {
                ready: { type: 'boolean' },
                pending: { type: 'number' },
                cacheSize: { type: 'number' }
              },
              required: ['ready', 'pending', 'cacheSize'],
              additionalProperties: true
            },
            create: () =>
              zodRuntime?.object({
                ready: zodRuntime.boolean(),
                pending: zodRuntime.number(),
                cacheSize: zodRuntime.number()
              })
          }
        },
        ...Object.fromEntries(
          Object.entries(MODEL_METHOD_DEFS).map(([name, definition]) => [`${NS}/${name}`, definition])
        )
      }
    })

    /**
     * Split reasoning into blank-line paragraph fragments, cutting any fragment
     * longer than the request limit at a whitespace boundary.
     * @param {string} text - original reasoning.
     * @param {boolean} running - whether the tail may still grow.
     * @param {number} limit - maximum characters per request.
     * @returns {{text: string, suffix: string, complete: boolean}[]}
     */
    function reasoningFragments(text, running, limit) {
      const result = []
      const separator = /\r?\n(?:[\t ]*\r?\n)+/g
      let start = 0
      while (true) {
        const match = separator.exec(text)
        let remaining = text.slice(start, match?.index ?? text.length)
        while (remaining.length > limit) {
          let cut = limit
          if (/[\uD800-\uDBFF]/.test(remaining.charAt(cut - 1))) cut -= 1
          const whitespace = remaining.slice(0, cut).search(/\s+\S*$/)
          if (whitespace > 0) cut = whitespace
          const source = remaining.slice(0, cut)
          remaining = remaining.slice(cut)
          const suffix = remaining.match(/^\s+/)?.[0] ?? ''
          remaining = remaining.slice(suffix.length)
          result.push({ text: source, suffix, complete: true })
        }
        result.push({
          text: remaining,
          suffix: match?.[0] ?? '',
          complete: match !== null || !running
        })
        if (match === null) return result
        start = match.index + match[0].length
      }
    }

    /** One disclosure's translation lifecycle: serial requests, cache, cancellation. */
    class ReasoningTranslation {
      constructor(maxTextChars, translate, publish) {
        this.maxTextChars = maxTextChars
        this.translate = translate
        this.publish = publish
        this.controller = new AbortController()
        this.cache = new Map()
        this.fragments = []
        this.pending = false
        this.failed = false
        this.error = undefined
      }

      update(text, running) {
        this.fragments = reasoningFragments(text, running, this.maxTextChars)
        this.emit()
        this.run()
      }

      retry() {
        this.failed = false
        this.error = undefined
        this.run()
      }

      dispose() {
        this.controller.abort()
      }

      isDisposed() {
        return this.controller.signal.aborted
      }

      emit() {
        if (this.isDisposed()) return
        const text = this.fragments
          .map(
            (fragment) =>
              (fragment.complete ? this.cache.get(fragment.text) ?? fragment.text : fragment.text) +
              fragment.suffix
          )
          .join('')
        this.publish({ text, pending: this.pending, failed: this.failed, error: this.error })
      }

      async run() {
        if (this.pending || this.failed || this.isDisposed()) return
        const nextOf = () =>
          this.fragments.find(
            (fragment) =>
              fragment.complete && fragment.text.trim() !== '' && !this.cache.has(fragment.text)
          )
        let next = nextOf()
        if (next === undefined) return
        this.pending = true
        this.emit()
        try {
          while (next !== undefined) {
            const translated = await this.translate(
              { text: next.text, targetLanguage: 'zh' },
              this.controller.signal
            )
            if (this.isDisposed()) return
            this.cache.set(next.text, translated)
            this.emit()
            next = nextOf()
          }
        } catch (_error) {
          if (!this.isDisposed()) {
            this.failed = true
            this.error = _error
          }
        } finally {
          this.pending = false
          this.emit()
        }
      }
    }

    /** Translation controls for one expanded reasoning body. */
    function TranslationBody(props) {
      const { running, translate, renderFactorySlot, activationError } = props
      // The slot guarantees `text` and `running`; the translator and the locale
      // lookup are our own contribution, so tolerate their absence rather than
      // failing the whole reasoning body.
      const text = typeof props.text === 'string' ? props.text : ''
      const translateRequests =
        typeof translate === 'function'
          ? translate
          : () => Promise.reject(new Error('offline translator unavailable'))
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [state, setState] = react.useState({
        text,
        pending: false,
        failed: Boolean(activationError),
        error: activationError
      })
      const [original, setOriginal] = react.useState(false)
      const translation = react.useRef(undefined)

      react.useEffect(() => {
        const controller = new ReasoningTranslation(MAX_TEXT_CHARS, translateRequests, setState)
        translation.current = controller
        return () => {
          controller.dispose()
          translation.current = undefined
        }
      }, [translate])

      react.useEffect(() => {
        translation.current?.update(text, running)
      }, [text, running, translate])

      const labels = react.useMemo(
        () => ({
          code: {
            copyLabel: t('copy'),
            copiedLabel: t('copied'),
            toolbarLabels: {
              codeLabel: t('codeTitle'),
              wrapLabel: t('wrap'),
              unwrapLabel: t('unwrap')
            }
          },
          footnotes: t('footnotes')
        }),
        [t]
      )

      const showOriginal = original || state.failed
      return jsxRuntime.jsxs('div', {
        'data-offline-translation': 'true',
        'data-translation-state': state.failed ? 'failed' : state.pending ? 'pending' : 'ready',
        'data-translation-view': showOriginal ? 'original' : 'translated',
        children: [
          jsxRuntime.jsxs('div', {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px',
              minHeight: '28px',
              marginBottom: '4px',
              color: 'var(--dsw-alias-label-secondary)',
              fontSize: '12px'
            },
            children: [
              jsxRuntime.jsx('button', {
                type: 'button',
                disabled: state.failed,
                onClick: () => setOriginal(!showOriginal),
                style: {
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: state.failed ? 'default' : 'pointer',
                  font: 'inherit',
                  padding: '0 2px'
                },
                children: t(showOriginal ? 'translation' : 'original')
              }),
              state.pending
                ? jsxRuntime.jsx('span', { role: 'status', children: t('translating') })
                : null,
              state.failed
                ? jsxRuntime.jsxs('span', {
                    role: 'status',
                    children: [
                      // Weights ship separately, so the first run of a fresh
                      // install fails here. Say what to do instead of showing a
                      // bare transport error.
                      state.error?.code === `${NS}/model-not-installed`
                        ? t('modelMissing')
                        : t('failed'),
                      jsxRuntime.jsx('button', {
                        type: 'button',
                        onClick: () => translation.current?.retry(),
                        style: {
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          font: 'inherit',
                          textDecoration: 'underline',
                          padding: '0 4px'
                        },
                        children: t('retry')
                      }),
                      activationError
                        ? jsxRuntime.jsx('span', {
                            children: ` ${String(activationError.message ?? activationError)}`
                          })
                        : null
                    ]
                  })
                : null
            ]
          }),
          // The Content Factory renders the code-block toolbar and footnotes for the
// reasoning text. The Body Slot only guarantees `text` and `running`, so fall
// back to plain preformatted text whenever the factory is unavailable: a
// missing factory must never blank out the reasoning body.
          typeof renderFactorySlot === 'function'
            ? renderFactorySlot(CONTENT_SLOT, {
                text: showOriginal ? text : state.text,
                running,
                labels
              })
            : jsxRuntime.jsx('pre', {
                style: {
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  font: 'inherit',
                  color: 'inherit'
                },
                children: showOriginal ? text : state.text
              })
        ]
      })
    }

    /**
     * Format a byte count the way the model list shows it: one decimal below
     * 1 GiB, whole MiB above.
     * @param {number} bytes - byte count.
     * @returns {string}
     */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—'
      const mib = bytes / 1048576
      if (mib >= 1024) return `${(mib / 1024).toFixed(2)} GiB`
      if (mib >= 100) return `${Math.round(mib)} MiB`
      return `${mib.toFixed(1)} MiB`
    }

/**
     * Stylesheet for both surfaces (the sidebar panel and the bundle page).
     *
     * Injected as a `<style data-plugin-css>` element, the way other plugins ship
     * CSS: a browser bundle cannot import a stylesheet, and inline `style` objects
     * cannot express hover, focus, or the row/progress layout. Every colour comes
     * from a documented theme token so light and dark follow the app theme.
     */
    const PANEL_CSS_KEY = `${PACKAGE_NAME}/panel.css`
    const PANEL_CSS = `
.ortl-page {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  padding: 28px 32px 72px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.62;
  -webkit-font-smoothing: antialiased;
}
.ortl-wrap { max-width: 780px; margin: 0 auto; }
.ortl-head { padding: 2px 2px 0; }
.ortl-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: .2px;
}
.ortl-title svg { color: var(--dsw-alias-brand-primary); flex: none; }
.ortl-lead {
  margin: 7px 0 0;
  color: var(--dsw-alias-label-secondary);
  max-width: 66ch;
}
.ortl-card {
  margin-top: 18px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.ortl-cardhead { padding: 15px 16px 10px; }
.ortl-cardtitle { display: flex; align-items: baseline; gap: 8px; font-size: 13.5px; font-weight: 600; }
.ortl-cardhint { margin: 3px 0 0; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
.ortl-rows { padding: 2px 8px 8px; }
.ortl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 14px;
  padding: 11px 10px;
  border-radius: 9px;
}
.ortl-row + .ortl-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.ortl-row[data-active="true"] { background: var(--dsw-alias-bg-layer-2); }
.ortl-rowhead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ortl-name { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ortl-facts {
  grid-column: 1;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
}
.ortl-badge {
  flex: none;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 17px;
  letter-spacing: .1px;
}
.ortl-badge--on {
  color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent);
}
.ortl-badge--accent {
  color: var(--dsw-alias-brand-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
}
.ortl-actions { display: flex; align-items: center; gap: 8px; justify-self: end; }
.ortl-btn {
  appearance: none;
  font: inherit;
  font-size: 12.5px;
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color .14s ease, border-color .14s ease, color .14s ease;
}
.ortl-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.ortl-btn:active:not(:disabled) { transform: translateY(.5px); }
.ortl-btn:disabled { opacity: .42; cursor: default; }
.ortl-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.ortl-btn--primary {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
@supports (background: color-mix(in srgb, red 10%, transparent)) {
  .ortl-btn--primary {
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
  }
  .ortl-btn--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent);
  }
}
.ortl-btn--danger:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}
.ortl-bar {
  grid-column: 1 / -1;
  height: 3px;
  margin-top: 7px;
  border-radius: 2px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.ortl-barfill {
  height: 100%;
  background: var(--dsw-alias-brand-primary);
  border-radius: 2px;
  transition: width .25s ease;
}
.ortl-body { padding: 4px 16px 16px; }
.ortl-label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 550; }
.ortl-field {
  box-sizing: border-box;
  width: 100%;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ortl-field::placeholder { color: var(--dsw-alias-label-secondary); opacity: .75; }
.ortl-field:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
}
.ortl-hint { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ortl-checkrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 16px 0 0;
  padding: 11px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 9px;
  cursor: pointer;
}
.ortl-checkrow:hover { background: var(--dsw-alias-bg-layer-2); }
.ortl-check {
  flex: none;
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.ortl-checktext { display: flex; flex-direction: column; gap: 1px; }
.ortl-checkhint { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ortl-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.ortl-status { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ortl-status[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); }
.ortl-status[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
.ortl-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.ortl-spacer { flex: 1 1 auto; }
.ortl-empty {
  padding: 18px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12.5px;
}
.ortl-skeleton {
  height: 12px;
  margin: 10px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  opacity: .7;
}
.ortl-sep { height: 1px; margin: 12px 0; background: var(--dsw-alias-border-l1); }
.ortl-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.ortl-note { margin: 18px 2px 0; color: var(--dsw-alias-label-secondary); font-size: 12px; max-width: 68ch; }
@media (prefers-reduced-motion: reduce) {
  .ortl-btn, .ortl-barfill { transition: none; }
}
`

    /**
     * Insert the stylesheet once per document.
     *
     * Idempotent because a plugin can be remounted by a reload cycle while the
     * previous `<style>` element stays in the document. An existing element is
     * rewritten in place: a hot-reloaded bundle carries new CSS under the same
     * key, and returning early would keep the stale copy until a full refresh.
     */
    function ensurePanelStyles() {
      if (typeof document === 'undefined') return
      if (typeof document.querySelector !== 'function' || document.head === undefined) return
      const existing = document.querySelector(`style[data-plugin-css="${PANEL_CSS_KEY}"]`)
      if (existing !== null) {
        if (existing.textContent !== PANEL_CSS) existing.textContent = PANEL_CSS
        return
      }
      const element = document.createElement('style')
      element.dataset.plugin = PACKAGE_NAME
      element.dataset.pluginCss = PANEL_CSS_KEY
      element.textContent = PANEL_CSS
      document.head.append(element)
    }

    /**
     * Small EN→中 glyph reused by the page title.
     * @param props - `{size}` in CSS pixels.
     */
    function TitleGlyph(props) {
      const size = typeof props?.size === 'number' ? props.size : 18
      return jsxRuntime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        children: [
          jsxRuntime.jsx('path', { d: 'M3.5 5.5h9v7h-9z' }),
          jsxRuntime.jsx('path', { d: 'M12.5 9.5h8v5h-8z' }),
          jsxRuntime.jsx('path', { d: 'M12.5 12.5 8 12.5' }),
          jsxRuntime.jsx('path', { d: 'M11 11.2 8.2 12.5l2.8 1.3' })
        ]
      })
    }

    /**
     * One model row: name, badges, facts, progress, actions.
     *
     * Pure presentation so the sidebar panel and the bundle page share one look.
     *
     * @param props - `{variant, busy, percent, t, onUse, onDownload, onRemove}`.
     */
    function ModelRow(props) {
      const { variant, busy, percent, t } = props
      const active = variant.active === true
      const installed = variant.installed === true
      const canRemove = installed && variant.bundled !== true && !active
      const facts = [
        variant.dtype,
        formatBytes(variant.bytes ?? 0),
        variant.measured?.warmMs ? `${variant.measured.warmMs} ms/${t('sentence')}` : null,
        variant.installed ? null : t('notDownloaded')
      ].filter(Boolean)
      return jsxRuntime.jsxs(
        'div',
        {
          className: 'ortl-row',
          'data-active': active ? 'true' : 'false',
          'data-model-row': variant.id,
          children: [
            jsxRuntime.jsxs('div', {
              className: 'ortl-rowhead',
              children: [
                jsxRuntime.jsx('span', { className: 'ortl-name', children: variant.label ?? variant.id }),
                active
                  ? jsxRuntime.jsx('span', { className: 'ortl-badge ortl-badge--on', children: t('inUse') })
                  : null,
                variant.recommended === true && !active
                  ? jsxRuntime.jsx('span', { className: 'ortl-badge ortl-badge--accent', children: t('recommended') })
                  : null
              ]
            }),
            jsxRuntime.jsx('div', {
              className: 'ortl-actions',
              children: active
                ? null
                : installed
                  ? jsxRuntime.jsxs('div', {
                      className: 'ortl-actions',
                      children: [
                        jsxRuntime.jsx('button', {
                          type: 'button',
                          className: 'ortl-btn ortl-btn--primary',
                          disabled: busy === true,
                          onClick: () => props.onUse(variant.id),
                          children: t('useModel')
                        }),
                        canRemove
                          ? jsxRuntime.jsx('button', {
                              type: 'button',
                              className: 'ortl-btn ortl-btn--danger',
                              disabled: busy === true,
                              onClick: () => props.onRemove(variant.id),
                              children: t('remove')
                            })
                          : null
                      ]
                    })
                  : jsxRuntime.jsx('button', {
                      type: 'button',
                      className: 'ortl-btn',
                      disabled: busy === true,
                      onClick: () => props.onDownload(variant.id),
                      children: busy ? `${t('downloading')} ${percent}%` : t('download')
                    })
            }),
            jsxRuntime.jsx('div', {
              className: 'ortl-facts',
              children: facts.map((fact, index) => jsxRuntime.jsx('span', { children: fact }, `${variant.id}-${index}`))
            }),
            busy && percent > 0
              ? jsxRuntime.jsx('div', {
                  className: 'ortl-bar',
                  role: 'progressbar',
                  'aria-valuenow': percent,
                  'aria-valuemin': 0,
                  'aria-valuemax': 100,
                  children: jsxRuntime.jsx('div', { className: 'ortl-barfill', style: { width: `${percent}%` } })
                })
              : null
          ]
        },
        variant.id
      )
    }

    /**
     * The whole model list card, shared by both surfaces.
     *
     * @param props - `{variants, busyId, transfer, t, onUse, onDownload, onRemove}`.
     */
    function ModelsCard(props) {
      const { variants, busyId, transfer, t } = props
      const rows = (variants ?? []).map((variant) =>
        jsxRuntime.jsx(
          ModelRow,
          {
            variant,
            busy: busyId === variant.id,
            percent:
              transfer?.id === variant.id && transfer.totalBytes > 0
                ? Math.min(100, Math.round((transfer.doneBytes / transfer.totalBytes) * 100))
                : 0,
            t,
            onUse: props.onUse,
            onDownload: props.onDownload,
            onRemove: props.onRemove
          },
          variant.id
        )
      )
      return jsxRuntime.jsxs('div', {
        className: 'ortl-rows',
        'data-offline-translation-models': '',
        children:
          rows.length > 0
            ? rows
            : [
                jsxRuntime.jsx('div', { className: 'ortl-skeleton', style: { width: '55%' } }),
                jsxRuntime.jsx('div', { className: 'ortl-skeleton', style: { width: '38%' } }),
                jsxRuntime.jsx('div', { className: 'ortl-skeleton', style: { width: '46%' } })
              ]
      })
    }

    /**
     * Model manager rendered on this bundle's own page in the plugin manager.
     *
     * Download and removal are Remote calls; progress is polled through `status`
     * because a Remote call cannot stream.
     *
     * @param props - `{models, download, remove, status, t}` from the slot.
     */
    function ModelManager(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [catalog, setCatalog] = react.useState(null)
      const [error, setError] = react.useState(null)
      const [busyId, setBusyId] = react.useState(null)
      const [transfer, setTransfer] = react.useState(null)

      react.useEffect(() => {
        ensurePanelStyles()
      }, [])

      const refresh = react.useCallback(async () => {
        try {
          const result = await props.models()
          if (!result?.ok) throw result?.error ?? new Error('unavailable')
          setCatalog(result.value)
          setTransfer(result.value?.transfer ?? null)
          setError(null)
        } catch (failure) {
          setError(failure)
        }
      }, [props.models])

      react.useEffect(() => {
        refresh()
      }, [refresh])

      // A Remote call cannot stream, so progress comes from polling `status`
      // while a variant is being fetched; the interval dies with the panel.
      react.useEffect(() => {
        if (busyId === null) return undefined
        let live = true
        const timer = setInterval(async () => {
          try {
            const result = await props.status()
            if (live && result?.ok && result.value?.transfer) setTransfer(result.value.transfer)
          } catch {
            // best-effort: the download call itself reports failure
          }
        }, 500)
        return () => {
          live = false
          clearInterval(timer)
        }
      }, [busyId, props.status])

      const run = async (id, action) => {
        setBusyId(id)
        setError(null)
        try {
          const result = await action({ id })
          if (!result?.ok) throw result?.error ?? new Error('request failed')
        } catch (failure) {
          setError(failure)
        } finally {
          setBusyId(null)
          setTransfer(null)
          await refresh()
        }
      }

      const variants = (catalog?.models ?? []).map((model) => ({
        ...model,
        active: model.id === catalog?.active
      }))

      return jsxRuntime.jsxs('section', {
        className: 'ortl-card',
        'data-offline-translation-bundle-models': '',
        children: [
          jsxRuntime.jsxs('div', {
            className: 'ortl-cardhead',
            children: [
              jsxRuntime.jsx('div', { className: 'ortl-cardtitle', children: t('modelsTitle') }),
              jsxRuntime.jsx('p', { className: 'ortl-cardhint', children: t('modelsIntro') })
            ]
          }),
          jsxRuntime.jsx(ModelsCard, {
            variants,
            busyId,
            transfer,
            t,
            onUse: () => {},
            onDownload: (id) => run(id, props.download),
            onRemove: (id) => run(id, props.remove)
          }),
          error === null
            ? null
            : jsxRuntime.jsx('div', {
                className: 'ortl-status',
                'data-tone': 'error',
                style: { padding: '0 16px 14px' },
                children: String(error?.message ?? error)
              })
        ]
      })
    }

    /**
     * Glyph for the sidebar's global panel row.
     *
     * The sidebar owns the button, its tooltip, and its label; it only asks this
     * entry for an icon of the requested square edge. `active` says whether the
     * panel is the selected one, so the glyph can carry a selected mark.
     *
     * @param props - `{size, active}` from `sidebar.panellist`.
     */
    function PanelGlyph(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      const active = props?.active === true
      return jsxRuntime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 1.9 : 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        role: 'img',
        'aria-hidden': 'true',
        children: [
          // Left bubble, right bubble: EN → 中.
          jsxRuntime.jsx('path', {
            d: 'M3 5.6a2 2 0 0 1 2-2h5.2a2 2 0 0 1 2 2v3.8a2 2 0 0 1-2 2H7.4L4.3 14v-2.7A2 2 0 0 1 3 9.4z'
          }),
          jsxRuntime.jsx('path', {
            d: 'M13.8 12.6a2 2 0 0 1 2-2H21a2 2 0 0 1 2 2v3.8a2 2 0 0 1-2 2h-.6v2.4l-3.1-2.4h-1.5a2 2 0 0 1-2-2z'
          }),
          jsxRuntime.jsx('path', { d: 'M6.1 6.3h3.5M7.9 5.2v1.1M6.4 9.6 7.9 7l1.5 2.6' }),
          jsxRuntime.jsx('path', { d: 'M17.2 14.1h3.2M17.6 16.9h1.9' })
        ]
      })
    }

    /**
     * Body of the sidebar's "Offline translation" panel.
     *
     * This is the plugin's settings page: model selection and download sit
     * beside the translation knobs, so a user who never opens the plugin list
     * can still change everything that matters. Values go through the
     * `settings` / `saveSettings` Remote pair, which persists them beside the
     * weights and applies them immediately; the loader Config form on the
     * bundle page stays as a second entrance to the same file.
     *
     * @param props - `{settings, saveSettings, download, remove, status, t}` from the slot.
     */
function PanelPage(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [current, setCurrent] = react.useState(null)
      const [draft, setDraft] = react.useState(null)
      const [error, setError] = react.useState(null)
      const [busyId, setBusyId] = react.useState(null)
      const [saving, setSaving] = react.useState(false)
      const [savedOnce, setSavedOnce] = react.useState(false)
      const [transfer, setTransfer] = react.useState(null)

      react.useEffect(() => {
        ensurePanelStyles()
      }, [])

      /**
       * Refresh from the Host.
       *
       * `preserveDraft` is what keeps an unsaved glossary edit alive across a
       * model download or removal — refreshing must not silently discard what the
       * user typed.
       *
       * @param preserveDraft - keep the edited fields, refresh only the facts.
       */
      const load = react.useCallback(
        async (preserveDraft) => {
          try {
            const result = await props.settings()
            if (!result?.ok) throw result?.error ?? new Error('unavailable')
            const value = result.value
            setCurrent(value)
            setTransfer(value?.transfer ?? null)
            setDraft((previous) =>
              preserveDraft === true && previous !== null
                ? { ...previous }
                : { modelId: value.modelId, glossary: value.glossary, repair: value.repair }
            )
            setError(null)
          } catch (failure) {
            setError(failure)
          }
        },
        [props.settings]
      )

      react.useEffect(() => {
        load(false)
      }, [load])

      // Progress comes from polling `status`: a Remote call cannot stream, and the
      // interval must not outlive the panel.
      react.useEffect(() => {
        if (busyId === null) return undefined
        let live = true
        const timer = setInterval(async () => {
          try {
            const result = await props.status()
            if (live && result?.ok && result.value?.transfer) setTransfer(result.value.transfer)
          } catch {
            // best-effort: the mutation call itself reports failure
          }
        }, 500)
        return () => {
          live = false
          clearInterval(timer)
        }
      }, [busyId, props.status])

      const save = async (patch) => {
        if (draft === null) return
        setSaving(true)
        setError(null)
        try {
          const result = await props.saveSettings({ ...draft, ...patch })
          if (!result?.ok) throw result?.error ?? new Error('save failed')
          const value = result.value
          setCurrent(value)
          setDraft({ modelId: value.modelId, glossary: value.glossary, repair: value.repair })
          setSavedOnce(true)
        } catch (failure) {
          setError(failure)
        } finally {
          setSaving(false)
        }
      }

      const runModelCall = async (id, action) => {
        setBusyId(id)
        setError(null)
        try {
          const result = await action({ id })
          if (!result?.ok) throw result?.error ?? new Error('request failed')
        } catch (failure) {
          setError(failure)
        } finally {
          setBusyId(null)
          setTransfer(null)
          await load(true)
        }
      }

      const ready = draft !== null && current !== null
      const dirty =
        ready &&
        (draft.glossary !== current.glossary || draft.repair !== current.repair || draft.modelId !== current.modelId)

      const tone = error !== null ? 'error' : dirty ? 'warn' : savedOnce ? 'ok' : 'idle'
      const statusText =
        error !== null
          ? String(error?.message ?? error)
          : dirty
            ? t('unsaved')
            : savedOnce
              ? t('saved')
              : ''

      const variants = current?.variants ?? []

      return jsxRuntime.jsx('div', {
        className: 'ortl-page',
        'data-offline-translation-panel': PANEL_ID,
        children: jsxRuntime.jsxs('div', {
          className: 'ortl-wrap',
          children: [
            jsxRuntime.jsxs('header', {
              className: 'ortl-head',
              children: [
                jsxRuntime.jsxs('h1', {
                  className: 'ortl-title',
                  children: [jsxRuntime.jsx(TitleGlyph, { size: 19 }), t('panelTitle')]
                }),
                jsxRuntime.jsx('p', { className: 'ortl-lead', children: t('panelIntro') })
              ]
            }),

            jsxRuntime.jsxs('section', {
              className: 'ortl-card',
              'aria-labelledby': 'ortl-models-title',
              children: [
                jsxRuntime.jsxs('div', {
                  className: 'ortl-cardhead',
                  children: [
                    jsxRuntime.jsxs('div', {
                      className: 'ortl-cardtitle',
                      id: 'ortl-models-title',
                      children: [
                        t('modelSection'),
                        activeModelBadge(current, t)
                      ]
                    }),
                    jsxRuntime.jsx('p', { className: 'ortl-cardhint', children: t('modelHint') })
                  ]
                }),
                jsxRuntime.jsx(ModelsCard, {
                  variants,
                  busyId,
                  transfer,
                  t,
                  onUse: (id) => save({ modelId: id }),
                  onDownload: (id) => runModelCall(id, props.download),
                  onRemove: (id) => runModelCall(id, props.remove)
                })
              ]
            }),

            jsxRuntime.jsxs('section', {
              className: 'ortl-card',
              'aria-labelledby': 'ortl-translation-title',
              children: [
                jsxRuntime.jsxs('div', {
                  className: 'ortl-cardhead',
                  children: [
                    jsxRuntime.jsx('div', {
                      className: 'ortl-cardtitle',
                      id: 'ortl-translation-title',
                      children: t('translationSection')
                    }),
                    jsxRuntime.jsx('p', { className: 'ortl-cardhint', children: t('glossaryHint') })
                  ]
                }),
                jsxRuntime.jsxs('div', {
                  className: 'ortl-body',
                  children: [
                    jsxRuntime.jsx('label', {
                      className: 'ortl-label',
                      htmlFor: 'ortl-glossary',
                      children: t('glossaryLabel')
                    }),
                    jsxRuntime.jsx('textarea', {
                      id: 'ortl-glossary',
                      className: 'ortl-field',
                      value: draft?.glossary ?? '',
                      spellCheck: false,
                      rows: 7,
                      disabled: !ready || saving,
                      placeholder: 'grep=查找\ntokenizer=分词器',
                      onChange: (event) => setDraft({ ...draft, glossary: event.target.value })
                    }),
                    jsxRuntime.jsxs('label', {
                      className: 'ortl-checkrow',
                      htmlFor: 'ortl-repair',
                      children: [
                        jsxRuntime.jsx('input', {
                          id: 'ortl-repair',
                          className: 'ortl-check',
                          type: 'checkbox',
                          checked: draft?.repair !== false,
                          disabled: !ready || saving,
                          onChange: (event) => setDraft({ ...draft, repair: event.target.checked })
                        }),
                        jsxRuntime.jsxs('span', {
                          className: 'ortl-checktext',
                          children: [
                            jsxRuntime.jsx('span', { children: t('repairLabel') }),
                            jsxRuntime.jsx('span', { className: 'ortl-checkhint', children: t('repairHint') })
                          ]
                        })
                      ]
                    }),
                    jsxRuntime.jsxs('div', {
                      className: 'ortl-foot',
                      children: [
                        jsxRuntime.jsx('button', {
                          type: 'button',
                          className: 'ortl-btn ortl-btn--primary',
                          disabled: !ready || saving || !dirty,
                          onClick: () => save({}),
                          children: saving ? t('saving') : t('save')
                        }),
                        jsxRuntime.jsx('div', {
                          className: 'ortl-status',
                          'data-tone': tone,
                          role: 'status',
                          'aria-live': 'polite',
                          children: statusText
                        })
                      ]
                    })
                  ]
                })
              ]
            }),

            jsxRuntime.jsx('p', { className: 'ortl-note', children: t('panelHint') })
          ]
        })
      })
    }

    /**
     * Badge naming the variant that is currently translating.
     * @param current - snapshot from `settings`, possibly still loading.
     * @param t - translator.
     */
    function activeModelBadge(current, t) {
      const active = current?.variants?.find((variant) => variant.active === true)
      if (active === undefined) return null
      return jsxRuntime.jsx('span', {
        className: 'ortl-badge ortl-badge--on',
        children: active.label ?? active.id ?? t('activeModel')
      })
    }

    const inject = ['remote', 'slots', 'locale']

    /**
     * Mount the local translation Remote face and the reasoning view.
     * @param ctx - browser plugin context.
     * @returns disposer joining both contributions.
     */
    async function apply(ctx) {
      const lifetime = new AbortController()
      ctx.effect(() => () => lifetime.abort(), 'offlineReasoningTranslator: query cancellation')
      ctx.effect(() => ctx.locale.register(NS, { en, zh }))
      let unmountRemote
      try {
        unmountRemote = await ctx.remote.$mount(TYPERT_REMOTE)
        const ui = await ctx.inject([`remote.${NS}`, ...inject.slice(1)], (child) => {
          const reasoning = child.slots.inject(SLOT, () =>
            child.slots.register(
              {
                name: SLOT,
                priority: 50,
                locale: NS,
                inject: () => ({
                  translate: (request, signal) =>
                    child.remote[NS]
                      .translate(request, signal)
                      .then((result) => (result.ok ? result.value : Promise.reject(result.error)))
                })
              },
              TranslationBody
            )
          )
          // Model management lives on this bundle's own page in the plugin
          // manager, keyed by the bundle package name.
          // The Gateway counts arguments against the declared parameters, so a
          // zero-argument method must be called with no input at all: passing `{}`
          // is already one business argument too many and fails with
          // `expected 0 business argument(s) plus an optional AbortSignal, got 2`.
          const settle = (promise) => promise.then((result) => (result.ok ? result : Promise.reject(result.error)))
          const callPlain = (method) => (signal) =>
            settle(child.remote[NS][method](...(signal === undefined ? [] : [signal])))
          const callInput = (method) => (request, signal) =>
            settle(child.remote[NS][method](request, ...(signal === undefined ? [] : [signal])))
          const remoteProps = () => ({
            models: callPlain('models'),
            status: callPlain('status'),
            settings: callPlain('settings'),
            saveSettings: callInput('saveSettings'),
            download: callInput('download'),
            remove: callInput('removeModel')
          })
          // Model management lives on this bundle's own page in the plugin
          // manager, keyed by the bundle package name.
          const manager = child.slots.inject(BUNDLE_CONFIG_SLOT, () =>
            child.slots.register(
              {
                name: BUNDLE_CONFIG_SLOT,
                key: PACKAGE_NAME,
                locale: NS,
                inject: remoteProps
              },
              ModelManager
            )
          )
          // …and again as a global panel: the sidebar owns the button and reads
          // its label from this entry, so the label is a thunk that follows the
          // active locale without re-registering.
          const panelIcon = child.slots.inject(PANEL_LIST_SLOT, () =>
            child.slots.register(
              {
                name: PANEL_LIST_SLOT,
                id: PANEL_ID,
                order: 30,
                label: () => (child.locale.getSnapshot().active === 'zh' ? zh.panelTitle : en.panelTitle),
                locale: NS
              },
              PanelGlyph
            )
          )
          const panelBody = child.slots.inject(MAIN_SLOT, () =>
            child.slots.register(
              {
                name: MAIN_SLOT,
                key: PANEL_ID,
                locale: NS,
                inject: remoteProps
              },
              PanelPage
            )
          )
          return () => {
            Promise.resolve(reasoning?.dispose?.()).catch(() => {})
            Promise.resolve(manager?.dispose?.()).catch(() => {})
            Promise.resolve(panelIcon?.dispose?.()).catch(() => {})
            Promise.resolve(panelBody?.dispose?.()).catch(() => {})
          }
        })
        return async () => {
          await Promise.resolve(ui?.dispose?.()).catch(() => {})
          await Promise.resolve(unmountRemote?.()).catch(() => {})
        }
      } catch (error) {
        // Degrade in place: keep the expanded reasoning body usable and state the
        // reason there, because the browser has no other channel back to the Host.
        console.error('[offline-reasoning-translator] activation failed', error)
        try {
          ctx.slots.inject(SLOT, () =>
            ctx.slots.register(
              {
                name: SLOT,
                // One step below the working registration, so a degraded mount is
                // distinguishable from a healthy one in the live slot tree.
                priority: 49,
                key: 'degraded',
                locale: NS,
                inject: () => ({
                  activationError: error,
                  translate: () => Promise.reject(error)
                })
              },
              TranslationBody
            )
          )
        } catch (registrationError) {
          console.error('[offline-reasoning-translator] fallback failed', registrationError)
        }
        return async () => {
          await Promise.resolve(unmountRemote?.()).catch(() => {})
        }
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
