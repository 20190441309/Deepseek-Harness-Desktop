# Release Rules
<!-- last-analyzed: 2026-09-18T02:00:00Z -->

## Version Sources
- `package.json` → `"version"` field (single source of truth; verified by `scripts/check-release-version.mjs` in publish.yml)

## Release Trigger
Two-stage manual pipeline on `main`:
1. `.github/workflows/release.yml` (`workflow_dispatch`, optional `include_macos`) — builds Windows NSIS Setup (+ optional macOS DMG), runs packaged smoke gate (2 attempts), uploads artifacts `DeepSeek-Harness-windows-x64` (+ `Deepseek-Harness-macos-arm64`).
2. `.github/workflows/publish.yml` (`workflow_dispatch`, inputs: `candidate_run_id`, `release_tag`, `expected_setup_sha256`) — verifies candidate run (completed+success, workflow_dispatch, release.yml, main), checks tag vs package.json version, requires ≥1 green test.yml run for the candidate SHA, downloads artifacts, verifies Setup SHA256, creates GitHub Release with `--latest` targeting the candidate SHA. Tag is created by the workflow — never tag locally.

## Test Gate
- Local: `npm test` (plus `npm run check:governance` / `npm run doc-sync` per .devin/skills/dshd-checks)
- CI: `test.yml` "Desktop tests" on push to main; publish.yml requires a green run on the exact candidate SHA
- Release acceptance: `npm run smoke:packaged` inside release.yml (blocking, 2 attempts)

## Registry / Distribution
- GitHub Releases only (Setup.exe + blockmap + latest.yml + SHA512SUMS.txt). electron-updater differential updates consume `latest.yml`. No npm publish.

## Release Notes Strategy
- Bilingual pair: `.github/release-notes.md` (zh) + `.github/release-notes.en.md` (en); publish.yml concatenates zh + `---` + en + provenance block into the release body.
- Sections: 这次更新 / 技术契约 / 安装与升级 / 平台范围 / 验证范围 / 反馈.

## CI Workflow Files
- `.github/workflows/release.yml`, `.github/workflows/publish.yml`, `.github/workflows/test.yml`
- `scripts/check-release-version.mjs`, `scripts/setup-harness.js`

## First-Time Setup Gaps
- none

## Current state (2026-09-18)
- `package.json` = 0.3.2; tag v0.3.2 not yet created; latest released tag v0.3.1.
- Candidate run `35292210832` (2026-09-18T00:41Z, commit `bb61a265e69`): success; artifacts downloaded to `tmp/rc-v032-updater/` (Setup SHA256 `C0FD40C12A9B8355E95F98456159411AC68F3F558CD22D914AB08885F531437D`).
- Green test run for bb61a265e69: `35292178260`. HEAD is `93f3e24ba3d` (sheen default off) with green test `35302199003` — pushed after the candidate.
