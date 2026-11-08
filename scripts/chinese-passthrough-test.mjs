// End-to-end proof that Chinese reasoning never reaches the one-way model.
//
// The reported failure was a Chinese block coming back as `?~ ~.~.~7****` with
// scrambled dates. Here the whole pipeline runs: a Chinese paragraph must be
// returned byte-identical, must count as skipped, and must not even spawn the
// worker; a mixed block must translate only its English sentence.
import { Context, Service } from '@deepseek-ai/cordis'

import OfflineReasoningTranslator from '../index.js'

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

const chinese =
  '我先确认一下这里的缓存是不是静态的。\n\n' +
  'Rufus 是 1977 年 6 月 26 日发布的，Ayrshire 在 2024 年 3 月 15 日更新了元数据。\n\n' +
  '所以结论是：先读配置，再决定要不要重建 worker。'

const t0 = Date.now()
const passthrough = await service.translate({ text: chinese, targetLanguage: 'zh' }, signal)
check('Chinese paragraph is returned unchanged', passthrough === chinese)
check('no worker was spawned for it', service.worker === undefined)
const afterChinese = await service.status(signal)
check('every sentence counted as skipped', afterChinese.stats.skipped >= 3, `skipped=${afterChinese.stats.skipped}`)
check('no decode was charged', afterChinese.stats.fragments === 0, `fragments=${afterChinese.stats.fragments}`)
console.log('CHINESE_MS', Date.now() - t0, 'STATS', JSON.stringify(afterChinese.stats))

const mixed =
  '我先解释一下为什么要改这里。\n' +
  'The merged decoder keeps its own cache, so a reset clears it.\n' +
  '这大概就是问题所在。'
const translated = await service.translate({ text: mixed, targetLanguage: 'zh' }, signal)
check('mixed block still translates its English sentence', /缓存|cache/i.test(translated) && !/merged decoder keeps/i.test(translated), translated)
check('mixed block keeps the Chinese sentences verbatim', translated.includes('我先解释一下为什么要改这里。') && translated.includes('这大概就是问题所在。'))
const afterMixed = await service.status(signal)
check('the mixed block charged exactly one decode', afterMixed.stats.fragments === 1, `fragments=${afterMixed.stats.fragments}`)
console.log('MIXED', JSON.stringify(translated))

// Close the worker so the process can exit without the drain timeout.
await service.disposeWorker?.()
console.log(failures === 0 ? 'OK: Chinese passthrough' : `FAILED: ${failures} check(s)`)
process.exit(failures === 0 ? 0 : 1)