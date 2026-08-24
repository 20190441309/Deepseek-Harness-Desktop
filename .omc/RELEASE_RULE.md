# Release Rules
<!-- last-analyzed: 2026-08-23T06:20:00Z -->

## Version Sources
- `package.json` `"version"` (electron-builder artifact names use `${version}`)
- `package-lock.json` root `"version"` and `packages[""].version`
- `.github/release-notes.md` (GitHub Release body via `--notes-file`)
- Tag must be `v${package.json.version}` (`scripts/check-release-version.mjs`)

## Release Trigger
- Push tag `v*` → `.github/workflows/release.yml` builds Windows NSIS + macOS arm64 DMG, then `gh release create`
- `workflow_dispatch` builds the same artifacts but does **not** publish a GitHub Release

## Test Gate
- Desktop: `npm test`
- Production table: CI windows Setup SHA, not local `dist/` (`docs/qa/production-acceptance-test-cases.md`)
- Tag path publishes immediately; table preferred order is dispatch → test → upload same files

## Registry / Distribution
- GitHub Releases only (no npm publish)
- Assets: `Deepseek-Harness-Desktop-Setup-*.exe` (+ `.blockmap`), `Deepseek-Harness-Desktop-*-mac-arm64.dmg`

## Release Notes Strategy
- Hand-written `.github/release-notes.md`; CI attaches it as the release body

## CI Workflow Files
- `.github/workflows/release.yml`

## First-Time Setup Gaps
- none
