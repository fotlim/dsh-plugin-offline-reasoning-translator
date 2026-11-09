// Regression cover for the defects found in the pre-release audit.
//
// Each case pins one bug that was live in 0.6.1 and had no test: a glossary term
// past the slot budget leaking into the source, a duplicated placeholder leaking
// into the pane, and a `postMessage` against a dead worker leaving the pending
// table dirty.
import { mask, unmaskDetailed } from '../lib/mask.js'
import { normalizeSource } from '../lib/normalize.js'
import { mountService } from './_service-stub.mjs'

let failures = 0

/**
 * @param name - case label.
 * @param actual - produced value.
 * @param expected - required value.
 */
function equal(name, actual, expected) {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left === right) {
    console.log(`ok   ${name}`)
    return
  }
  failures += 1
  console.log(`FAIL ${name}\n  expected: ${right}\n  actual:   ${left}`)
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

// --- glossary budget -------------------------------------------------------
// Three mapped terms in one sentence: the first two become placeholders, the
// third must stay as free English. Splicing the user's Chinese rendering into
// the English source made the model repeat the clause instead of translating it.
const glossary = { alpha: '甲', beta: '乙', gamma: '丙' }
const overflowing = mask('alpha and beta and gamma are neighbours.', glossary)
// Terms are matched longest-first, so which one falls off the budget is not
// fixed for equal length terms — only the count is.
equal('two terms take slots', overflowing.slots.length, 2)
const leftEnglish = ['alpha', 'beta', 'gamma'].filter((term) => overflowing.masked.includes(term))
equal('exactly one term stays English', leftEnglish.length, 1)
assert('no Chinese is spliced into the source', /[\u4e00-\u9fff]/.test(overflowing.masked.replace(/\[[0-9]+\]/g, '')) === false)

const single = mask('alpha only', glossary)
equal('a single term still takes a slot', single.slots, ['甲'])

// --- duplicated placeholder ------------------------------------------------
// A decoder that repeats `[0]` used to leave the literal token in the reading
// pane, because the second occurrence was skipped as already used.
const duplicated = unmaskDetailed('[0] then [0]', ['grep'])
equal('a repeated token restores twice', duplicated.text, 'grep then grep')
equal('and reports nothing unresolved', duplicated.unresolved, 0)

const mangled = unmaskDetailed('< < 0 > >', ['grep'])
equal('an angle-bracket token still restores', mangled.text, 'grep')

// --- source correction must not re-flow code ------------------------------
// The space collapsing that fixes hard-wrapped prose used to run inside code
// spans too, silently re-flowing a sample the reader studies for its alignment.
const fenced = 'Look at this:\n```\nconst a = 1\n    const b  =  2\n```\nand see.'
equal('a fenced block keeps its exact bytes', normalizeSource(fenced).includes('    const b  =  2'), true)
equal('inline code keeps its exact bytes', normalizeSource('call `a  b` twice.').includes('`a  b`'), true)
equal('prose is still collapsed', normalizeSource('two  spaces here.'), 'two spaces here.')

// --- request() against a dead worker ---------------------------------------
// `ensureWorker()` can hand back a worker that dies before `postMessage` runs.
// The call must reject and leave no entry behind: a stale pending id inflates
// `status().pending` forever and stalls the dispose drain.
const service = await mountService()
service.worker = {
  postMessage() {
    throw new Error('worker is gone')
  }
}
let rejected
try {
  await service.request('hello', 'zh', undefined)
} catch (error) {
  rejected = error
}
equal('the call rejects with the transport error', rejected?.message, 'worker is gone')
equal('no pending entry is left behind', service.pending.size, 0)
equal('no outstanding id is left behind', service.outstanding.size, 0)

if (failures !== 0) {
  console.error(`${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('OK: audit fixes')