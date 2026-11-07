/**
 * Degeneracy guard for local translation output.
 *
 * The quantized Marian model can enter a repetition loop on input it does not
 * like — a real 2026-11-07 fragment came back as
 * `皮尔斯皮尔斯皮尔斯…人端人端人端…/////////=======` . Loops are worse than no
 * translation at all: the reader cannot tell they are broken, and the text
 * looks like a rendering bug. This module recognises the shapes such loops
 * take so the caller can keep the original sentence instead.
 */

/** A single character repeated this many times in a row is a loop. */
const MAX_CHAR_RUN = 12
/** Longest substring scanned for consecutive repeats. */
const MAX_LOOP_UNIT = 60
/**
 * Repeats that count as a loop, by unit length. A short unit has to repeat many
 * times to be suspicious; a whole clause repeating three times never is.
 */
const LOOP_REPEATS_SHORT = 6
const LOOP_REPEATS_LONG = 3
/** Unit length above which the long-clause threshold applies. */
const LONG_UNIT = 20
/**
 * Below this length a repetition is not suspicious enough to drop the text.
 * Twelve characters is already double the shortest unit that can repeat six
 * times, so a loop of that shape is caught while two-word answers are not
 * examined at all.
 */
const MIN_CHECKED_LENGTH = 12

/**
 * True when one substring repeats at least `limit` times back to back.
 * @param text - candidate text.
 * @param limit - repeat count that counts as a loop.
 */
function hasSubstringLoop(text) {
  const maxUnit = Math.min(MAX_LOOP_UNIT, Math.floor(text.length / LOOP_REPEATS_LONG))
  for (let unit = 1; unit <= maxUnit; unit += 1) {
    const limit = unit > LONG_UNIT ? LOOP_REPEATS_LONG : LOOP_REPEATS_SHORT
    let index = 0
    while (index + unit * limit <= text.length) {
      const pattern = text.slice(index, index + unit)
      if (pattern.trim() === '') {
        index += 1
        continue
      }
      let repeats = 1
      let cursor = index + unit
      while (cursor + unit <= text.length && text.slice(cursor, cursor + unit) === pattern) {
        repeats += 1
        cursor += unit
      }
      if (repeats >= limit) return true
      index = cursor > index + unit ? cursor : index + 1
    }
  }
  return false
}

/**
 * True when one character runs on for too long (separator spam).
 * @param text - candidate text.
 */
function hasCharRun(text) {
  let run = 1
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === text[index - 1]) {
      run += 1
      if (run >= MAX_CHAR_RUN) return true
    } else {
      run = 1
    }
  }
  return false
}

const HAN_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
/** Words long enough to be prose rather than a stray initial. */
const LATIN_WORD = /[A-Za-z][A-Za-z'-]+/g
/** A source shorter than this cannot be judged on translated length. */
const SHORT_SOURCE_WORDS = 15
/** Han characters a real translation of a 15-word sentence always exceeds. */
const MIN_HAN_FOR_LONG_SOURCE = 5
/** Latin words that mean the model echoed the source instead of translating. */
const ECHO_LATIN_WORDS = 6
/** Han characters below which such an echo has no Chinese at all. */
const ECHO_MAX_HAN = 2

/**
 * Generation options for the single repair attempt.
 *
 * The first pass runs at `no_repeat_ngram_size: 4` / `repetition_penalty: 1.15`,
 * which is enough to keep most sentences clean while still reading like prose.
 * A retry is only spent on a piece the first pass already failed, so it can
 * afford a blunter setting: forbidding even 2-token repeats and pushing the
 * penalty up breaks most loops. On the sample that motivated this module the
 * loop survived a penalty of 1.15 but not 1.35 with a 2-gram ban.
 */
export const RETRY_GENERATION = { no_repeat_ngram_size: 2, repetition_penalty: 1.35, num_beams: 1 }

/**
 * Count Han characters, used by both the echo and the length checks.
 * @param text - candidate text.
 */
export function countHan(text) {
  const matches = typeof text === 'string' ? text.match(HAN_CHAR) : null
  return matches === null ? 0 : matches.length
}

/**
 * Judge a translation well enough to decide whether one retry is worth it.
 *
 * Three failures are distinguishable without any reference translation:
 *
 * - `degenerate`: the model looped (delegated to {@link looksDegenerate}).
 * - `untranslated`: the model echoed English with no Chinese in it.
 * - `too-short`: a long sentence came back as a couple of characters, which is
 *   the decoder collapsing onto an early end-of-sequence.
 *
 * The caller retries once and then keeps the English original, so a false
 * positive costs ~0.5 s while a false negative shows the reader damage. The
 * thresholds are therefore one-sided: they need many obvious signals.
 *
 * @param translated - the translated piece (assessed before unmasking).
 * @param source - the English piece it came from.
 * @returns `{ ok, reasons }` where reasons is empty on success.
 */
export function assess(translated, source) {
  if (typeof translated !== 'string') return { ok: false, reasons: ['missing'] }
  const compact = translated.trim()
  if (compact === '') return { ok: false, reasons: ['empty'] }
  const reasons = []
  if (looksDegenerate(compact, source)) reasons.push('degenerate')
  const han = countHan(compact)
  const latinWords = (compact.match(LATIN_WORD) ?? []).length
  if (latinWords >= ECHO_LATIN_WORDS && han <= ECHO_MAX_HAN) reasons.push('untranslated')
  const sourceWords = typeof source === 'string' ? source.split(/\s+/).filter((word) => word !== '').length : 0
  if (sourceWords >= SHORT_SOURCE_WORDS && han < MIN_HAN_FOR_LONG_SOURCE) reasons.push('too-short')
  return { ok: reasons.length === 0, reasons }
}

/**
 * Decide whether a translation is a degenerate loop.
 *
 * @param translated - the translated piece.
 * @param source - the English piece it came from, for the length sanity bound.
 * @returns true when the piece must not be shown.
 */
export function looksDegenerate(translated, source) {
  if (typeof translated !== 'string') return true
  const compact = translated.trim()
  if (compact === '') return false
  // A long run of one character is unambiguous at any length: no legitimate
  // translation writes twelve identical characters in a row.
  if (hasCharRun(compact)) return true
  if (compact.length > MIN_CHECKED_LENGTH) {
    if (hasSubstringLoop(compact)) return true
  }
  // A translation four times the source length (plus slack for CJK) is a loop
  // that has not repeated a single unit often enough to trip the checks above.
  if (typeof source === 'string' && source.length > 40 && compact.length > source.length * 4 + 60) return true
  return false
}