/**
 * Sentence-level segmentation for the local translation model.
 *
 * Why this exists: a quantized Marian model translates one or two sentences
 * well and degenerates on a paragraph. Measured on a long reasoning fragment,
 * feeding several hundred characters at once produced a loop
 * (`皮尔斯皮尔斯皮尔斯…`, `造人造人造人…`) instead of a translation, while the
 * same sentences translated one at a time came back clean. So every fragment is
 * cut into sentences here, translated one by one, and rejoined with the exact
 * separators it arrived with.
 */

/** Abbreviations whose trailing period does not end a sentence. */
const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'cf',
  'approx',
  'fig',
  'eq',
  'no',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'inc',
  'ltd',
  'co',
  'al'
])

/** A single piece longer than this is cut again at whitespace. */
const MAX_PIECE_CHARS = 320
/** Target size when cutting an over-long piece. */
const TARGET_PIECE_CHARS = 180

const CLOSING = { ')': '(', ']': '[', '}': '{' }

/**
 * Mark the characters a sentence split must not cut through.
 *
 * Splitting inside `` `const value = map.get(key)!` `` is what produced a real
 * failure: the span arrived in two halves, so neither half matched the inline
 * code rule, and the first half was translated as prose
 * (`失败行为“ 默认值 = map.get (key)!`). The same holds for a period inside
 * parentheses or an array literal. Everything inside an inline code span or a
 * balanced bracket group is therefore opaque to the splitter.
 *
 * @param text - the fragment being split.
 * @returns {Uint8Array} one flag per character, 1 = do not split here.
 */
function protectedMask(text) {
  const mask = new Uint8Array(text.length)
  let open = -1
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '`') continue
    if (open < 0) {
      open = index
      continue
    }
    for (let cursor = open; cursor <= index; cursor += 1) mask[cursor] = 1
    open = -1
  }
  // An unclosed backtick protects the rest of the fragment: a half span must
  // never be translated as prose either.
  if (open >= 0) for (let cursor = open; cursor < text.length; cursor += 1) mask[cursor] = 1
  const stack = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '(' || char === '[' || char === '{') {
      stack.push({ char, at: index })
      continue
    }
    if (char !== ')' && char !== ']' && char !== '}') continue
    const top = stack.pop()
    if (top === undefined || CLOSING[char] !== top.char) continue
    for (let cursor = top.at; cursor <= index; cursor += 1) mask[cursor] = 1
  }
  return mask
}

/**
 * Decide whether the period that precedes `position` closes a sentence.
 * @param text - the whole fragment.
 * @param position - index of the first character after the period (and its space).
 * @returns true when a new sentence starts there.
 */
function startsNewSentence(text, position) {
  const next = text[position]
  if (next === undefined) return false
  // A quote, bracket, backtick, digit, or CJK character can all legitimately
  // open the next sentence; only lowercase continuations are treated as
  // mid-sentence, and those are the ones an abbreviation produces.
  return !/[a-z,;:]/.test(next)
}

/**
 * True when the period at `index` belongs to an abbreviation.
 * @param text - the whole fragment.
 * @param index - index of the period.
 */
function isAbbreviation(text, index) {
  const tail = /([A-Za-z.]+)$/.exec(text.slice(Math.max(0, index - 12), index))
  if (tail === null) return false
  const word = tail[1].replace(/\.$/, '').toLowerCase()
  if (ABBREVIATIONS.has(word)) return true
  // Initials such as `J. Smith` and dotted paths such as `a.b.c`.
  return /^[a-z]$/.test(word) || /\./.test(word)
}

/**
 * Cut an over-long sentence at whitespace so the model never sees a wall of
 * text. Returns the piece unchanged when it already fits.
 * @param text - one sentence without its separator.
 * @returns {string[]} one or more pieces, each joined with a single space when
 *   the split happened, preserving every word.
 */
function splitLongPiece(text) {
  if (text.length <= MAX_PIECE_CHARS) return [text]
  const pieces = []
  let rest = text
  while (rest.length > MAX_PIECE_CHARS) {
    const guard = protectedMask(rest)
    const window = rest.slice(0, TARGET_PIECE_CHARS)
    let cut = window.search(/\s+\S*$/)
    if (cut <= 0) cut = window.length
    // Walk back to a whitespace that is not inside a code span or bracket
    // group; a cut there would split an identifier in half.
    while (cut > 0 && guard[cut - 1] === 1) {
      const earlier = rest.slice(0, cut - 1).search(/\s+\S*$/)
      if (earlier <= 0) break
      cut = earlier
    }
    pieces.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest !== '') pieces.push(rest)
  return pieces
}

/**
 * Split one already-complete fragment into translatable pieces.
 *
 * Separators are returned alongside each piece so the caller can rejoin the
 * translated text without inventing or dropping whitespace.
 *
 * @param text - fragment text.
 * @returns {{text: string, sep: string}[]} pieces in order; empty input yields
 *   one empty piece so callers need no special case.
 */
export function splitForTranslation(text) {
  if (typeof text !== 'string') return [{ text: '', sep: '' }]
  const guard = protectedMask(text)
  /** @type {{text: string, sep: string}[]} */
  const pieces = []
  let start = 0
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (guard[index] === 1) {
      index += 1
      continue
    }
    const isTerminator = char === '.' || char === '!' || char === '?' || char === '。' || char === '！' || char === '？'
    const isNewline = char === '\n'
    if (!isTerminator && !isNewline) {
      index += 1
      continue
    }
    // Consume a run of terminators (`?!`, `...`) and the whitespace after it.
    let cursor = index + 1
    if (isTerminator) {
      while (cursor < text.length && /[.!?。！？]/.test(text[cursor])) cursor += 1
    }
    let separatorEnd = cursor
    while (separatorEnd < text.length && /[ \t]/.test(text[separatorEnd])) separatorEnd += 1
    if (isTerminator && cursor === index + 1 && char === '.' && isAbbreviation(text, index)) {
      index = cursor
      continue
    }
    if (isTerminator && !startsNewSentence(text, cursor)) {
      index = cursor
      continue
    }
    const piece = text.slice(start, cursor)
    const sep = text.slice(cursor, separatorEnd)
    const parts = splitLongPiece(piece)
    for (const [offset, part] of parts.entries()) {
      pieces.push({
        text: part,
        // Cut pieces are rejoined with the space the split removed; the last
        // one keeps whatever separator followed the sentence.
        sep: offset === parts.length - 1 ? sep : ' '
      })
    }
    start = separatorEnd
    index = separatorEnd
  }
  if (start < text.length) pieces.push(...splitLongPiece(text.slice(start)).map((part, offset, all) => ({ text: part, sep: offset === all.length - 1 ? '' : ' ' })))
  if (pieces.length === 0) pieces.push({ text, sep: '' })
  return pieces
}