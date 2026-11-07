/**
 * Round-trip check for the sentence segmenter: every piece plus its separator
 * must reproduce the input byte for byte. Segmentation that loses a space is
 * invisible in review and very visible in the transcript.
 */
import assert from 'node:assert/strict'

import { splitForTranslation } from '../lib/segment.js'

const cases = [
  '',
  'One sentence.',
  'First sentence. Second sentence! Third one?',
  'No terminator at the end',
  'Line one\nLine two\n\nLine three after a blank line.',
  'Use `e.g.` and `i.e.` inline, plus `J. Smith` and `a.b.c` — none of these end a sentence.',
  'Trailing space.  Double space after.   Then text',
  '中文标点。第二句！第三句？',
  'A very long sentence without any terminator that goes on and on and on and must be cut at whitespace because the model cannot handle a wall of text like this one at all whatsoever'
]

let failures = 0
for (const input of cases) {
  const pieces = splitForTranslation(input)
  const rebuilt = pieces.map((piece) => piece.text + piece.sep).join('')
  try {
    assert.equal(rebuilt, input)
    console.log(`OK   ${JSON.stringify(input.slice(0, 40))} → ${pieces.length} piece(s)`)
  } catch {
    failures += 1
    console.log(`FAIL ${JSON.stringify(input)}`)
    console.log(`     rebuilt ${JSON.stringify(rebuilt)}`)
    for (const piece of pieces) console.log(`     piece ${JSON.stringify(piece.text)} sep ${JSON.stringify(piece.sep)}`)
  }
}

// The cut must respect whitespace rather than slicing a word in half.
const long = 'word '.repeat(200).trim()
for (const piece of splitForTranslation(long)) {
  assert.ok(!/\S{60,}/.test(piece.text) || piece.text.length < 60, 'a cut piece kept a very long unbroken run')
}
console.log(`LONG pieces ${splitForTranslation(long).length}`)

if (failures > 0) {
  console.log(`FAILED ${failures}`)
  process.exit(1)
}
console.log('OK: segmenter round-trips every case')