// Language gate: the model is one-way English→Chinese. Chinese input produced a
// wall of noise for a real user (`?~ ~.~.~7****`, scrambled dates), so anything
// that is already Chinese must never reach it — while a mixed block keeps
// translating its English sentences.
import {
  countHan,
  countLatinWords,
  needsTranslation
} from '../lib/language.js'
import { splitForTranslation } from '../lib/segment.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`)
}

check('counts Han', countHan('这是中文') === 4, String(countHan('这是中文')))
check('counts Latin words', countLatinWords('the parser reads files') === 4)

check('plain English needs work', needsTranslation('The parser reads the file.'))
check('Chinese with a name does not', needsTranslation('Rufus 是 1977 年 6 月 26 日发布的。') === false)
check('pure Chinese does not', needsTranslation('我需要先检查缓存是否为空，然后再决定。') === false)
check('Chinese with a version does not', needsTranslation('这次升级把 q8 换成 fp32 了。') === false)
// A quoted English phrase inside a Chinese sentence is not worth a decode: the
// answer would already be Chinese, so the gate keeps the original.
check('a quotation inside Chinese does not', needsTranslation('他说 hello world 给我听。') === false)
check('English with one Chinese word does', needsTranslation('The runner 跑完了 eight independent arms.'))
check('digits and punctuation only do not', needsTranslation('2026-11-07 22:51:32') === false)
check('symbols only do not', needsTranslation('=> ... --- ***') === false)
check('empty does not', needsTranslation('') === false)
check('placeholders count as words', needsTranslation('Run [0] before committing.'))

// A mixed block: the gate is applied per sentence, so Chinese sentences stay put
// and English ones are still translated. This is the case the reader reported.
const mixed =
  '我先解释一下为什么要改这里。The merged decoder keeps its own cache, so a reset clears it. ' +
  '这大概就是问题所在。'
const pieces = splitForTranslation(mixed).map((piece) => ({
  text: piece.text,
  translate: needsTranslation(piece.text)
}))
check('mixed block splits into 3 sentences', pieces.length >= 3, `pieces=${pieces.length}`)
check(
  'only the English sentence is sent to the model',
  pieces.filter((piece) => piece.translate).length === 1,
  JSON.stringify(pieces.map((piece) => piece.translate))
)
console.log('SENTENCES', JSON.stringify(pieces))

console.log(failures === 0 ? 'OK: language gate' : `FAILED: ${failures} check(s)`)
process.exit(failures === 0 ? 0 : 1)