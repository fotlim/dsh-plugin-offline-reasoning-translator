/**
 * Placeholder masking for text that must survive translation byte-for-byte:
 * fenced code, inline code, URLs, file paths, `@refs` and identifier-shaped
 * names. Each match is replaced by a short token (`[0]`, see {@link TOKEN}) that
 * the decoder treats as one unit, and the original text is restored verbatim
 * afterwards.
 *
 * Glossary terms are masked by the same mechanism, with the wanted replacement
 * stored as the slot value: a small NMT model translates `grep` as 「尖叫」, so
 * the term never reaches the model as free text.
 */

import { glossaryMatchers } from './glossary.js'

/**
 * All span rules are applied in a single pass.
 *
 * Applying them one after another made a later rule eat an earlier rule's
 * placeholder: `npm test` became `[0]`, and the literal-index rule then masked
 * that `[0]` as if it were source text, so the reader saw `[0]` instead of the
 * command. One combined alternation keeps every rule blind to the others'
 * output, and the alternatives are ordered so the wider span wins.
 */
const SPAN_RULES = [
  // fenced code blocks (``` ... ```), keep the fences' content untouched
  /```[\s\S]*?```/g,
  // inline code spans
  /`[^`\n]+`/g,
  // URLs
  /\bhttps?:\/\/[^\s<>"'`)\]]+/g,
  // Windows and POSIX file paths (at least one separator, no spaces)
  /\b[A-Za-z]:\\[^\s<>"'`|]+/g,
  /(?:^|\s)\/(?:[\w.-]+\/)+[\w.-]+/g,
  // @path refs used by the agent
  /@[\w./\\-]{2,}/g,
  // Literal bracket indices (`arr[0]`) would be indistinguishable from a
  // placeholder on the way back, so they take a slot of their own.
  /\[\d+\]/g,
  // Runs of decorative punctuation (`=====`, `-----`, `////`, `****`). The
  // model answers these with an unbounded run of the same character, which is
  // exactly the loop the reader saw, so they never reach it as free text.
  /[=\-_*#~+/\\|]{3,}/g
]

const SPAN_PATTERN = new RegExp(SPAN_RULES.map((rule) => `(?:${rule.source})`).join('|'), 'g')

/**
 * How many glossary terms may be masked in one sentence.
 *
 * Every masked term becomes a `<<n>>` placeholder the model has never seen.
 * Three or more in a sentence measurably made it reorder or repeat clauses, so
 * past the budget the sentence keeps its identifiers as free text and takes the
 * vocabulary miss instead of the structural break.
 */
const MAX_GLOSSARY_SLOTS = 2

/**
 * Identifier shapes that no word list can enumerate.
 *
 * The glossary covers the terms seen so far, but reasoning text names things
 * nobody thought to list: `onnxruntime-node` came back as `onxruntime-node`
 * (one character dropped) and `DSH_OFFLINE_TRANSLATOR_MODEL_ROOT` came back as
 * `DSH_ OFFFLINE_TRANSLATOR_MODEL_ROOT` (a space inserted and an extra letter).
 * A shape is enough to recognise these, so they are matched structurally.
 *
 * Each rule is deliberately narrow. A false positive is cheap — the span is
 * restored verbatim, so a masked `well-known` simply stays English — while a
 * miss corrupts an identifier the reader has to retype.
 */
const IDENTIFIER_RULES = [
  // SCREAMING_SNAKE_CASE environment variables and constants
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/g,
  // snake_case with three or more parts
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/g,
  // kebab-case with three or more parts, e.g. a model name
  /\b[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}\b/g,
  // two-part kebab that ends in a technology marker, e.g. onnxruntime-node
  /\b[a-z][a-z0-9]*-(?:node|js|ts|cli|api|web|wasm|py|rs|sh|gyp|css|sql)\b/g,
  // member access and dotted names: map.get, ctx.slots.inject, JSON.parse
  /\b[a-z][A-Za-z0-9]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/g,
  // camelCase identifiers
  /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g,
  // command line flags
  /--[a-z][\w=-]*/g
]

/**
 * How many structural identifiers may be masked in one sentence.
 *
 * Same reasoning as the glossary budget: each one is a placeholder the decoder
 * has to keep in place, and a sentence full of them loses its grammar.
 */
const MAX_IDENTIFIER_SLOTS = 3

/** camelCase needs a real hump to be an identifier rather than a short word. */
const MIN_CAMEL_LENGTH = 8

/**
 * Dotted forms that are abbreviations, not member access. Masking `e.g.` made
 * the model drop both placeholders and the sentence came back untranslated.
 */
const NOT_IDENTIFIERS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'a.k.a', 'u.s', 'a.m', 'p.m', 'al'])

/**
 * Placeholder syntax.
 *
 * Measured against the five two-placeholder sentences that used to fail, five
 * styles were compared on how often the decoder hands the token back intact:
 *
 * | token   | survived |
 * | ------- | -------- |
 * | `[0]`   | 5/5 (verbatim, never re-spaced) |
 * | `<<0>>` | 0/5 verbatim (came back as `<<0>`, `< <1 >`, `<<% >`) |
 * | `#0#`   | 1/5 (`#0#` → `#6#0`, `#1字`) |
 * | `{{0}}` | 0/5, collapsed into brace soup |
 * | `<0>`   | 2/5 |
 *
 * Square brackets are the only shape the model treats as one unit and keeps.
 * The angle-bracket forms below are still accepted on the way back so a model
 * that reverts to the old habit cannot leak a raw token into the reading pane.
 */
const TOKEN = (n) => `[${n}]`

/** Every form a placeholder has come back as, most literal first. */
const TOKEN_SQUARE = /\[\s*(\d+)\s*\]/g
const TOKEN_ANGLE = /<[<\s]*(\d+)[>\s]*>/g
const TOKEN_HASH = /#\s*(\d+)\s*#/g
/** A token whose digits were replaced by punctuation, e.g. `<<% >`. */
const TOKEN_MANGLED = /<[<\s]*(?:\d+|[^<>\s]{1,4})[>\s]*>/g

/**
 * Mask protected spans, then glossary terms.
 * @param {string} text - source text.
 * @param {Record<string, string> | undefined} glossary - term → replacement.
 * @returns {{masked: string, slots: string[]}} masked text and the restored spans.
 */
export function mask(text, glossary) {
  const slots = []
  let masked = text.replace(SPAN_PATTERN, (match) => {
    // keep surrounding whitespace out of the slot so the sentence stays readable
    const lead = match.match(/^\s*/)[0]
    const tail = match.match(/\s*$/)[0]
    const core = match.slice(lead.length, match.length - tail.length)
    const index = slots.push(core) - 1
    return `${lead}${TOKEN(index)}${tail}`
  })
  // Structural identifiers run before the glossary so an unseen name is protected
// even when nothing in the term list matches it.
  let identifierSlots = 0
  for (const rule of IDENTIFIER_RULES) {
    if (identifierSlots >= MAX_IDENTIFIER_SLOTS) break
    masked = masked.replace(rule, (match) => {
      if (identifierSlots >= MAX_IDENTIFIER_SLOTS) return match
      if (NOT_IDENTIFIERS.has(match.toLowerCase())) return match
      // A short camelCase hit is usually a sentence-starting English word; only
      // long humped names and dotted names are clearly identifiers.
      const humps = match.split(/[A-Z]/).length - 1
      if (match.includes('.') === false && humps < 2 && match.length < MIN_CAMEL_LENGTH) return match
      identifierSlots += 1
      return TOKEN(slots.push(match) - 1)
    })
  }
  if (glossary !== undefined) {
    let glossarySlots = 0
    for (const { pattern, replacement } of glossaryMatchers(glossary)) {
      if (glossarySlots >= MAX_GLOSSARY_SLOTS) break
      masked = masked.replace(pattern, () => {
        glossarySlots += 1
        if (glossarySlots > MAX_GLOSSARY_SLOTS) return replacement
        return TOKEN(slots.push(replacement) - 1)
      })
    }
  }
  return { masked, slots }
}

/**
 * Restore masked spans.
 *
 * Models freely re-space and partly drop the delimiters (`<<1>>` → `< 1>`,
 * `<1 >`, `< < 1 > >`), so the pattern accepts any run of angle brackets and
 * whitespace around the digits. Worse forms exist: one real run turned the
 * token into `<<% >`, with the digits replaced by punctuation, and that used to
 * reach the reader verbatim.
 *
 * Recovery is deliberately conservative. When exactly one span went missing and
 * exactly one slot was never consumed, the model mangled a token rather than
 * dropping its content, so the missing span is put where the mangled token
 * stands. Anything more ambiguous is reported instead of guessed, and the
 * caller falls back to the English sentence.
 *
 * @param {string} translated - model output.
 * @param {string[]} slots - spans returned by {@link mask}.
 * @returns {{text: string, damaged: number, unresolved: number}} `unresolved`
 *   counts mangled tokens that still hold no content and must not be shown.
 */
export function unmaskDetailed(translated, slots) {
  if (slots.length === 0) return { text: translated, damaged: 0, unresolved: 0 }
  const used = new Set()
  const restore = (match, digits) => {
    const index = Number(digits)
    if (digits === undefined || !Number.isInteger(index) || index < 0 || index >= slots.length) return match
    if (used.has(index)) return match
    used.add(index)
    return slots[index]
  }
  let text = translated
    .replace(TOKEN_SQUARE, restore)
    .replace(TOKEN_ANGLE, restore)
    .replace(TOKEN_HASH, restore)
  /** Tokens left standing that no longer say which span they hold. */
  const mangled = text.match(TOKEN_MANGLED) ?? []
  if (mangled.length === 0) return { text, damaged: 0, unresolved: 0 }
  const unused = slots.map((_, index) => index).filter((index) => !used.has(index))
  if (mangled.length === 1 && unused.length === 1) {
    text = text.replace(TOKEN_MANGLED, slots[unused[0]])
    return { text, damaged: 1, unresolved: 0 }
  }
  return { text, damaged: mangled.length, unresolved: mangled.length }
}

/**
 * Restore masked spans, taking the unambiguous single-slot recovery with it.
 * @param {string} translated - model output.
 * @param {string[]} slots - spans returned by {@link mask}.
 * @returns {string} restored text; use {@link unmaskDetailed} when the caller
 *   needs to know whether the output was damaged beyond recovery.
 */
export function unmask(translated, slots) {
  return unmaskDetailed(translated, slots).text
}
