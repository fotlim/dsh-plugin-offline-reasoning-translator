/**
 * Decide whether a piece of reasoning text is worth translating at all.
 *
 * The model here is a *one-way* English→Chinese translator. Feeding it Chinese
 * does not produce Chinese: it produces noise (the reader's report was a wall of
 * `?~ ~.~.~7****` and scrambled dates). DSH sessions routinely reason in Chinese
 * already, or mix a Chinese paragraph with an English identifier, so the guard
 * has to run per sentence — the segmenter hands us sentences, and a mixed block
 * must still translate its English half.
 */

/** Han characters, including the CJK extension blocks a Chinese model emits. */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
/** Latin words; a single letter does not count, `node.js` counts as two. */
const LATIN_WORD = /[A-Za-z][A-Za-z'-]+/g

/**
 * Chinese counts as dominant when it is at least this many times the Latin word
 * count. Two is deliberately conservative: `Rufus 是 1977 年 6 月 26 日` (one
 * Latin word, eight Han) is Chinese with a name in it, while `他说 hello world`
 * (two Latin words, two Han) is a sentence with a quotation worth translating.
 */
const CHINESE_DOMINANCE = 2

/** @returns {number} Han character count. */
export function countHan(text) {
  return (String(text).match(HAN) ?? []).length
}

/** @returns {number} Latin word count. */
export function countLatinWords(text) {
  return (String(text).match(LATIN_WORD) ?? []).length
}

/**
 * Whether translating this text could plausibly produce Chinese out of English.
 *
 * @param text - one sentence-sized piece, before masking.
 * @returns {boolean} false for Chinese-dominant, symbol-only or math-only text.
 */
export function needsTranslation(text) {
  const source = String(text ?? '')
  const words = countLatinWords(source)
  // Nothing word-like: pure punctuation, digits, emoji, a lone `=>`.
  if (words === 0) return false
  const han = countHan(source)
  if (han === 0) return true
  // Already Chinese (with names, versions or identifiers in the middle).
  return han < words * CHINESE_DOMINANCE
}