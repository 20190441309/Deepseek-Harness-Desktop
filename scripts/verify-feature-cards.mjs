#!/usr/bin/env node
// Gate: docs/features/ card schema — field table (id/status/last verified),
// status enum, `_` filename prefix <-> killed, required sections for live
// cards, and README index <-> live-card sync.
import { join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { repoRoot, runGate, fail, isMain, read } from './lib/gate.mjs'

const STATUSES = new Set(['active', 'proposed', 'killed'])
const REQUIRED_SECTIONS = ['## User paths', '## Invariants', '## Gates', '## Sources']
const META_FILES = new Set(['README.md', '_template.md'])

export function collect(root) {
  const violations = []
  const dir = join(root, 'docs/features')
  if (!existsSync(dir)) return violations
  const liveIds = []

  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md') || META_FILES.has(name) || name.endsWith('.en.md')) continue
    const rel = `docs/features/${name}`
    const text = read(join(dir, name))
    const killed = name.startsWith('_')

    const id = text.match(/\|\s*\*\*id\*\*\s*\|\s*`([^`]+)`/)
    if (!id) fail(violations, rel, 'missing `**id**` field row')
    const status = text.match(/\|\s*\*\*status\*\*\s*\|\s*`([a-z]+)`/)
    if (!status) {
      fail(violations, rel, 'missing `**status**` field row')
    } else if (!STATUSES.has(status[1])) {
      fail(violations, rel, `unknown status \`${status[1]}\` (active | proposed | killed)`)
    } else {
      if (status[1] === 'killed' && !killed) fail(violations, rel, 'status killed requires `_` filename prefix')
      if (status[1] !== 'killed' && killed) fail(violations, rel, '`_` filename prefix is reserved for status killed')
    }
    if (!/\|\s*\*\*last verified\*\*\s*\|\s*\d{4}-\d{2}-\d{2}/.test(text)) {
      fail(violations, rel, 'missing or malformed `**last verified**` (needs `YYYY-MM-DD — …`)')
    }
    if (!killed) {
      for (const s of REQUIRED_SECTIONS) {
        if (!text.includes(`\n${s}`) && !text.startsWith(s)) fail(violations, rel, `missing section \`${s}\``)
      }
      // `Decision:` is a declared field in ## Sources — `none` or a link to an
      // existing docs/decisions/ record (the card says WHAT, the record WHY).
      const src = text.split('\n## Sources')[1]?.split('\n## ')[0] ?? ''
      const decision = src.split('\n').find((l) => /Decision/.test(l))
      if (!decision) {
        fail(violations, rel, 'missing `Decision:` line in ## Sources (`- Decision: none` or a docs/decisions/ link)')
      } else {
        for (const m of decision.matchAll(/docs\/decisions\/(\S+?\.md)/g)) {
          if (!existsSync(join(root, m[1]))) fail(violations, rel, `Decision link missing record ${m[1]}`)
        }
      }
      if (id) liveIds.push(id[1])
    }
  }

  // README index <-> live cards sync.
  const readmePath = join(dir, 'README.md')
  if (existsSync(readmePath)) {
    const readme = read(readmePath)
    const indexed = new Set([...readme.matchAll(/\|\s*\[([a-z0-9-]+)\]\(([a-z0-9-]+)\.md\)/g)].map((m) => m[1]))
    for (const id of liveIds) {
      if (!indexed.has(id)) fail(violations, 'docs/features/README.md', `index missing live card \`${id}\``)
    }
    for (const id of indexed) {
      if (!existsSync(join(dir, `${id}.md`))) fail(violations, 'docs/features/README.md', `index links missing card \`${id}.md\``)
    }
  }
  return violations
}

if (isMain(import.meta.url)) {
  runGate('verify-feature-cards', collect, repoRoot())
}
