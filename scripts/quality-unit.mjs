/**
 * Unit checks for the degeneracy guard, using the real broken output a user
 * reported: repeated words, separator spam, and a long run of `////`.
 */
import assert from 'node:assert/strict'

import { looksDegenerate } from '../lib/quality.js'

const garbage = [
  // The reported fragment: the same few words and separators, over and over.
  '末日: 皮尔斯皮尔斯皮尔斯皮尔斯皮尔斯皮尔斯皮尔斯皮尔斯',
  '造人造人造人造人造人造人造人造人造人造人造人造人造人',
  '和机器人: /////////////。',
  '=========================================',
  'The translation repeated this clause. The translation repeated this clause. The translation repeated this clause. The translation repeated this clause.',
  '博客: 地球之光, ' + '端点为: $1\\\\\\\\\\\\\\'.repeat(4)
]

const healthy = [
  '',
  '这是一个边界情况: 工作线程和事件循环之间的竞态条件。',
  '我需要检查一下解析器在删除引用前是否处理空列表。',
  'Wait... what?! That is surprising.',
  '第一句。第二句。第三句。',
  '调用 `npm test` 后, 结果通过, 只有一条失败。',
  '这是一个很长的正常句子, 用来确认长度检查不会误伤内容: 缓存命中时不会重新计算, 未命中时才会调用模型。'
]

for (const text of garbage) {
  assert.equal(looksDegenerate(text, 'source text'), true, `should be flagged: ${text.slice(0, 40)}`)
  console.log(`FLAGGED ${JSON.stringify(text.slice(0, 32))}`)
}
for (const text of healthy) {
  assert.equal(looksDegenerate(text, 'source text'), false, `should pass: ${text.slice(0, 40)}`)
  console.log(`CLEAN   ${JSON.stringify(text.slice(0, 32))}`)
}
console.log('OK: degeneracy guard')