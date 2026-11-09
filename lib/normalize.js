/**
 * Source-side correction, applied before any text reaches the model.
 *
 * Nothing here is about the translation itself: it removes damage that the
 * model cannot recover from. Two classes matter most.
 *
 * 1. Invisible characters. Reasoning streams carry zero-width spaces, soft
 *    hyphens and no-break spaces, and a no-break space between two words makes
 *    the tokenizer split them differently from the same text with a plain
 *    space. Stripping them measurably steadies the output.
 * 2. Hard-wrapped lines. Chat output wraps at a fixed column, so a single
 *    sentence arrives as `...because the worker\nneeds to drain first.` The
 *    segmenter splits on newlines, so an un-unwrapped paragraph is translated
 *    as many short fragments — each loses the context of the one before it and
 *    the reconstructed Chinese reads choppy. Joining the wraps back together
 *    before splitting is what makes a wrapped paragraph translate like a
 *    paragraph.
 *
 * Everything is a linear regex pass plus one line walk: the cost is measured in
 * microseconds, so it can run on every request without a cache of its own.
 */

const ZERO_WIDTH = /[\u200b-\u200f\u2060\ufeff\u00ad]/g
const NO_BREAK_SPACE = /[\u00a0\u2007\u202f]/g
const IDEOGRAPHIC_SPACE = /\u3000/g
const FULLWIDTH_LATIN = /[\uff21-\uff3a\uff41-\uff5a\uff10-\uff19]/g
const SMART_SINGLE = /[\u2018\u2019\u201b]/g
const SMART_DOUBLE = /[\u201c\u201d\u201f]/g
const ELLIPSIS = /\u2026/g
const DASHES = /[\u2013\u2014]/g
const TRAILING_SPACES = /[ \t]+$/gm
const INNER_SPACE_RUN = /([^\s])[ \t]{2,}/g
const EXCESS_BLANK = /\n{3,}/g

/** A line that opens a new block never continues the previous one. */
const BLOCK_START = /^\s*(?:[-*+]|\d+[.)]|#{1,6}\s|>|\||```|===)/
/** A line that already closes a sentence never continues either. */
const SENTENCE_END = /[.!?;:)\]}'"`\]\u201d]$/
/** Characters that prove the line was cut mid-sentence by a wrap. */
const CUT_TAIL = /[A-Za-z0-9,(\[\-]$/

/**
 * Fullwidth Latin letters and digits to their ASCII forms. Chinese text that
 * quotes an identifier in fullwidth is common enough that the model otherwise
 * copies the wide glyph instead of the identifier.
 */
function toAscii(ch) {
  return String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
}

/**
 * True when `next` is the wrapped remainder of `previous`.
 *
 * Deliberately narrow: the line must end in something a sentence cannot end
 * with, and the next line must be plain lowercase prose. A list, a heading, a
 * fenced block, or a hanging indent is left untouched.
 *
 * @param previous - the previous non-empty line, leading indent stripped.
 * @param next - the next non-empty line, leading indent stripped.
 */
function isWrapped(previous, next) {
  if (SENTENCE_END.test(previous)) return false
  if (BLOCK_START.test(previous) || BLOCK_START.test(next)) return false
  if (!CUT_TAIL.test(previous)) return false
  return /^[a-z(]/.test(next)
}

/**
 * Rejoin lines that a fixed-column wrap split apart.
 * @param text - text with `\n` line endings.
 */
function unwrapWraps(text) {
  const lines = text.split('\n')
  const merged = []
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/, '')
    if (line !== '' && merged.length > 0 && merged[merged.length - 1] !== '') {
      const previous = merged[merged.length - 1]
      const previousHead = previous.replace(/^\s+/, '')
      const nextHead = line.replace(/^\s+/, '')
      if (isWrapped(previousHead, nextHead)) {
        // A trailing hyphen is a word split by the wrap, not a compound.
        merged[merged.length - 1] = previousHead.endsWith('-')
          ? previous.slice(0, -1) + nextHead
          : `${previous} ${nextHead}`
        continue
      }
    }
    merged.push(line)
  }
  return merged.join('\n')
}

/** Fenced blocks and inline code are shown verbatim, so they are not corrected. */
const FENCED = /```[\s\S]*?```/g
const INLINE_CODE = /`[^`\n]+`/g
/** Private-use marker for a protected span; the text never contains NUL. */
const HOLE = '\u0000'

/**
 * Correct the source text before translation.
 *
 * Idempotent and safe on text that needs no correction: the caller can run it on
 * every fragment without checking first.
 *
 * Code is lifted out first and put back untouched. Collapsing a run of spaces is
 * right for prose that arrived through a hard wrap, but inside a fenced block it
 * would silently re-flow a copied code sample — and the reader studies those
 * spans for their alignment.
 *
 * @param text - the fragment as it arrived.
 * @returns the corrected fragment.
 */
export function normalizeSource(text) {
  if (typeof text !== 'string' || text === '') return text
  /** @type {string[]} */
  const holes = []
  const protectedText = text
    .replace(FENCED, (match) => `${HOLE}${holes.push(match) - 1}${HOLE}`)
    .replace(INLINE_CODE, (match) => `${HOLE}${holes.push(match) - 1}${HOLE}`)
  const cleaned = protectedText
    .replace(ZERO_WIDTH, '')
    .replace(NO_BREAK_SPACE, ' ')
    .replace(IDEOGRAPHIC_SPACE, ' ')
    .replace(FULLWIDTH_LATIN, toAscii)
    .replace(SMART_SINGLE, "'")
    .replace(SMART_DOUBLE, '"')
    .replace(ELLIPSIS, '...')
    .replace(DASHES, '-')
  const normalized = unwrapWraps(cleaned)
    .replace(TRAILING_SPACES, '')
    .replace(INNER_SPACE_RUN, '$1 ')
    .replace(EXCESS_BLANK, '\n\n')
    .trim()
  if (holes.length === 0) return normalized
  return normalized.replace(new RegExp(`${HOLE}(\\d+)${HOLE}`, 'g'), (match, index) => holes[Number(index)] ?? match)
}