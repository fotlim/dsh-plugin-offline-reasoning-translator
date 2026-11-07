/**
 * Build a side-by-side comparison of two bench runs.
 *   node scripts/compare.mjs bench-a.json bench-b.json [out.md]
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [leftFile, rightFile, outFile] = process.argv.slice(2)
const left = JSON.parse(readFileSync(leftFile, 'utf8'))
const right = JSON.parse(readFileSync(rightFile, 'utf8'))

const lines = [
  `# bench: ${left.label}  vs  ${right.label}`,
  '',
  '| # | EN | A: ' + left.label + ' | B: ' + right.label + ' |',
  '|---|---|---|---|',
  ...left.rows.map((row) => {
    const other = right.rows.find((candidate) => candidate.index === row.index)
    const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
    return `| ${row.index} | ${escape(row.en)} | ${escape(row.zh)} | ${escape(other?.zh)} |`
  }),
  '',
  `A: load ${left.loadMs} ms, median ${left.median} ms, rss ${left.rss} MB`,
  `B: load ${right.loadMs} ms, median ${right.median} ms, rss ${right.rss} MB`,
  ''
]
const target = outFile ?? 'compare.md'
writeFileSync(target, lines.join('\n'), 'utf8')
console.log('WROTE', target)