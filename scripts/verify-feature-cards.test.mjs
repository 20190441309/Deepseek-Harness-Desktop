import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collect } from './verify-feature-cards.mjs'
import { makeFixture } from './lib/fixture.mjs'

const CARD = `# Feature: x

| Field | Value |
| --- | --- |
| **id** | \`x-card\` |
| **status** | \`active\` |
| **last verified** | 2026-09-17 — smoke |

## User paths

1. a

## Invariants

- i

## Gates

| Kind | What |
| --- | --- |
| Automated | none |

## Sources

- Decision: none
`

test('accepts a well-formed card indexed in README', (t) => {
  const root = makeFixture(t, {
    'docs/features/x-card.md': CARD,
    'docs/features/README.md': '# Feature Spine\n\n| [x-card](x-card.md) | a | b | c |\n',
  })
  assert.deepEqual(collect(root), [])
})

test('rejects missing status and unindexed cards', (t) => {
  const root = makeFixture(t, {
    'docs/features/y.md': CARD.replace('| **status** | `active` |\n', '').replace('`x-card`', '`y`'),
    'docs/features/README.md': '# Feature Spine\n',
  })
  const v = collect(root).join('\n')
  assert.match(v, /missing `\*\*status\*\*`/)
  assert.match(v, /index missing live card `y`/)
})

test('killed cards need the underscore prefix and vice versa', (t) => {
  const root = makeFixture(t, {
    'docs/features/z.md': CARD.replace('`active`', '`killed`').replace('`x-card`', '`z`'),
    'docs/features/_w.md': CARD.replace('`x-card`', '`w`'),
  })
  const v = collect(root).join('\n')
  assert.match(v, /status killed requires `_`/)
  assert.match(v, /reserved for status killed/)
})
