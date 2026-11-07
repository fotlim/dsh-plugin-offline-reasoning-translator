// Unit coverage for the correction layer: source normalisation, output
// punctuation cleanup and the retry judgement. No model involved, so this runs
// in milliseconds and pins the rules that the eval harness then measures.
import { mask, unmask, unmaskDetailed } from '../lib/mask.js'
import { assess } from '../lib/quality.js'
import { normalizeSource } from '../lib/normalize.js'
import { postprocess } from '../lib/postprocess.js'

let failures = 0

/**
 * @param name - case label.
 * @param actual - produced value.
 * @param expected - required value.
 */
function equal(name, actual, expected) {
  if (actual === expected) {
    console.log(`ok   ${name}`)
    return
  }
  failures += 1
  console.log(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
}

/**
 * @param name - case label.
 * @param condition - must be true.
 */
function assert(name, condition) {
  if (condition) {
    console.log(`ok   ${name}`)
    return
  }
  failures += 1
  console.log(`FAIL ${name}`)
}

// --- source normalisation -------------------------------------------------

equal('unwrap a mid-sentence wrap', normalizeSource('the worker needs to\ndrain first.'), 'the worker needs to drain first.')
equal(
  'unwrap a comma-ending wrap',
  normalizeSource('because the queue is full,\nthe caller waits.'),
  'because the queue is full, the caller waits.'
)
equal(
  'unwrap a hyphenated word',
  normalizeSource('the re-\ntry succeeds.'),
  'the retry succeeds.'
)
equal('keep a real paragraph break', normalizeSource('First point.\n\nSecond point.'), 'First point.\n\nSecond point.')
equal('keep a list item break', normalizeSource('Steps:\n- one\n- two'), 'Steps:\n- one\n- two')
equal('keep a heading break', normalizeSource('Setup:\n## Install'), 'Setup:\n## Install')
equal('drop zero-width characters', normalizeSource('a\u200bb\u00adc'), 'abc')
equal('replace no-break spaces', normalizeSource('two\u00a0words'), 'two words')
equal('widen nothing, narrow fullwidth latin', normalizeSource('\uff41\uff42\uff11\uff12'), 'ab12')
equal('unify smart quotes', normalizeSource('\u201cquoted\u201d'), '"quoted"')
equal('collapse excess blank lines', normalizeSource('a\n\n\n\nb'), 'a\n\nb')
equal('collapse inner space runs', normalizeSource('a  b   c'), 'a b c')
assert('normalize is idempotent', normalizeSource(normalizeSource('x\ny\nz')) === normalizeSource('x\ny\nz'))
assert('normalize keeps empty input', normalizeSource('') === '')

// --- output cleanup -------------------------------------------------------

equal('fullwidth comma after Han', postprocess('这是一个边界情况, 不是错误'), '这是一个边界情况，不是错误')
equal('fullwidth question mark after Han', postprocess('为什么?'), '为什么？')
equal('fullwidth colon after Han', postprocess('注意: 这里'), '注意：这里')
equal('fullwidth period after Han', postprocess('完成了.'), '完成了。')
equal('keep a decimal point', postprocess('耗时 1.5 秒'), '耗时 1.5 秒')
equal('keep a dotted identifier', postprocess('文件 node.js 会被读取'), '文件 node.js 会被读取')
equal('keep punctuation after latin', postprocess('the tool, reads'), 'the tool, reads')
equal('strip space before fullwidth period', postprocess('完成 。'), '完成。')
equal('collapse a stuttered unit', postprocess('这个的的的选项'), '这个的选项')
equal('keep meaningful reduplication', postprocess('慢慢地走'), '慢慢地走')
equal('keep an ellipsis', postprocess('等等…'), '等等…')
equal('collapse a repeated sentence end', postprocess('好的。。。。'), '好的。')

// --- placeholder restoration ---------------------------------------------

const MASKED = mask('The worker calls onnxruntime-node directly.', { 'onnxruntime-node': 'onnxruntime-node' })
assert('masking protects an unseen identifier', MASKED.masked.includes('[0]'))
equal('restore a square token', unmask('The worker calls [0] directly.', MASKED.slots), 'The worker calls onnxruntime-node directly.')
equal('restore a clean token', unmask(MASKED.masked, MASKED.slots), 'The worker calls onnxruntime-node directly.')
equal('restore a re-spaced token', unmask('The worker calls < 0 > directly.', MASKED.slots), 'The worker calls onnxruntime-node directly.')
equal('restore a split token', unmask('The worker calls < < 0 > > directly.', MASKED.slots), 'The worker calls onnxruntime-node directly.')

const damaged = unmaskDetailed('The worker calls <<% > directly.', MASKED.slots)
equal('recover one mangled token from the one unused slot', damaged.text, 'The worker calls onnxruntime-node directly.')
equal('a recovered token is not left unresolved', damaged.unresolved, 0)

const ambiguous = unmaskDetailed('Use <<% > and < < 2 > > here.', ['alpha', 'beta'])
assert('a mangled token with no matching unused slot is left unresolved', ambiguous.unresolved > 0)
equal('an unmatched index is not restored', ambiguous.text.includes('alpha'), false)

// --- retry judgement ------------------------------------------------------

const LONG_SOURCE = 'The worker drains outstanding native calls before it terminates, because killing the thread mid-inference crashes the host process.'
assert('clean translation passes', assess('工作线程在终止前会排空未完成的原生调用，因为在中途杀死线程会导致宿主进程崩溃。', LONG_SOURCE).ok)
assert('untranslated echo is refused', assess('The worker drains outstanding native calls before it terminates.', LONG_SOURCE).reasons.includes('untranslated'))
assert('too-short output is refused', assess('可以。', LONG_SOURCE).reasons.includes('too-short'))
assert('a loop is refused', assess('皮尔斯皮尔斯皮尔斯皮尔斯皮尔斯皮尔斯', LONG_SOURCE).reasons.includes('degenerate'))
assert('empty output is refused', !assess('   ', LONG_SOURCE).ok)
assert('a short source is not judged on length', assess('可以。', 'Ok.').ok)
assert('reasons are empty when ok', assess('这是一个回答。', LONG_SOURCE).reasons.length === 0)

console.log(`\n${failures === 0 ? 'OK: correction layer' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)