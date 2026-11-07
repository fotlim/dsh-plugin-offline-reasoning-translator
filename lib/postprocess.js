/**
 * Output cleanup for a NMT model that learned Chinese from mixed corpora.
 *
 * Measured artefacts: `我需要检查一下 分析器在删除引用前是否处理空列表 。`
 * — spaces between Han characters and before full-width punctuation, and
 * `。` repeated until the token budget runs out when the model loops.
 * It also keeps the source's ASCII punctuation: `这是一个边界情况, 不是错误.`
 * which reads as half-converted Chinese. None of this carries meaning, so all of
 * it is safe to normalise deterministically.
 *
 * Order matters: spaces go first (a stray space would otherwise stop the
 * punctuation rules from matching the Han neighbour), then punctuation, then
 * repetition. Every rule is anchored on a Han neighbour so identifiers, URLs and
 * numbers that stayed in English keep their own punctuation style.
 */

const HAN = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
/** Full-width punctuation that never takes a leading space. */
const CLOSERS = '，。、；：？！）】」』〉》…'
/** Full-width punctuation that never takes a trailing space. */
const OPENERS = '（【「『〈《'

const HAN_SPAN = new RegExp(`([${HAN}])[\\t ]+([${HAN}])`, 'g')
const BEFORE_CLOSER = new RegExp(`[\\t ]+([${CLOSERS}])`, 'g')
const AFTER_OPENER = new RegExp(`([${OPENERS}])[\\t ]+`, 'g')
const REPEATED_SENTENCE_END = /。{2,}/g
const REPEATED_ELLIPSIS = /…{3,}/g

/**
 * ASCII punctuation the model left behind after a Han character. Reachable
 * pairs only: a `,` after Chinese is a Chinese comma, and so on. A period is
 * converted only when nothing alphanumeric follows, so `1.5` and `node.js`
 * survive.
 */
const HAN_BEFORE_ASCII = new RegExp(`([${HAN}])[\\t ]*([,;:?!])`, 'g')
const HAN_BEFORE_PERIOD = new RegExp(`([${HAN}])[\\t ]*\\.(?=[\\t ]|$)`, 'g')
const FULL_WIDTH_OF = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' }

/**
 * Space between a Han character and a following ASCII word is correct and is
 * kept; the rule only removes it before ASCII punctuation, which the rules
 * above already did. This one handles a Han character followed by a leftover
 * bracket or quote the model shortened: `列表 )` → `列表)`.
 */
const HAN_BEFORE_ASCII_CLOSER = new RegExp(`([${HAN}])[\\t ]+([)\\]])`, 'g')

/**
 * Chinese does not space after its own punctuation. Only the Han-followed case
 * is collapsed: `， next` in English remains `, next`.
 */
const SPACE_AFTER_FULLWIDTH = new RegExp(`([${CLOSERS}])[\\t ]+(?=[${HAN}])`, 'g')

/**
 * ASCII punctuation between a restored identifier and Chinese: the model keeps
 * the source comma because the placeholder ends in `>>`, so
 * ``run `npm test`, 检查`` arrives with an ASCII comma and a space. A comma
 * followed by Chinese is a Chinese comma.
 */
const ASCII_PUNCT_BEFORE_HAN = new RegExp(`([,;:?!])[\\t ]+(?=[${HAN}])`, 'g')

/**
 * The model sometimes stutters a short Han unit: `的的的` / `检查检查检查`.
 * Only three or more consecutive copies collapse, so reduplication that carries
 * meaning (`慢慢`, `看看`) is untouched.
 */
const REPEATED_HAN_UNIT = new RegExp(`([${HAN}]{1,2})\\1{2,}`, 'g')

/**
 * The model brackets English words it thinks it is quoting, and because the
 * placeholder token is gone by now the quote survives unmasking:
 * `清除 " tokenizer 缓存` / `" embedding表`. Only quotes sitting between a Han
 * character (or the string edge) and an ASCII word are dropped — a quote pair
 * around real content is left alone.
 */
const STRAY_QUOTE_LEADING = /^"\s*(?=[A-Za-z])/
const STRAY_QUOTE_AFTER_HAN = new RegExp(`([${HAN}])\\s*"\\s*(?=[A-Za-z])`, 'g')
const STRAY_QUOTE_BEFORE_HAN = new RegExp(`([A-Za-z0-9])\\s*"\\s*(?=[${HAN}])`, 'g')

/**
 * Normalise spacing and punctuation and collapse repetition loops.
 * @param text - raw model output, already unmasked.
 * @returns cleaned text.
 */
export function postprocess(text) {
  if (typeof text !== 'string' || text === '') return text
  let cleaned = text
  // Two passes: removing one space can expose another adjacent pair.
  for (let pass = 0; pass < 2; pass += 1) cleaned = cleaned.replace(HAN_SPAN, '$1$2')
  cleaned = cleaned
    .replace(BEFORE_CLOSER, '$1')
    .replace(AFTER_OPENER, '$1')
    .replace(REPEATED_SENTENCE_END, '。')
    .replace(REPEATED_ELLIPSIS, '…')
    .replace(HAN_BEFORE_ASCII, (_match, han, punctuation) => han + FULL_WIDTH_OF[punctuation])
    .replace(HAN_BEFORE_PERIOD, '$1。')
    .replace(HAN_BEFORE_ASCII_CLOSER, '$1$2')
    .replace(SPACE_AFTER_FULLWIDTH, '$1')
    .replace(ASCII_PUNCT_BEFORE_HAN, (_match, punctuation) => FULL_WIDTH_OF[punctuation])
    .replace(REPEATED_HAN_UNIT, '$1')
    .replace(STRAY_QUOTE_AFTER_HAN, '$1 ')
    .replace(STRAY_QUOTE_BEFORE_HAN, '$1 ')
  cleaned = cleaned.replace(STRAY_QUOTE_LEADING, '')
  return cleaned.trim()
}