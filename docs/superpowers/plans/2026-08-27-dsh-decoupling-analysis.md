# dsh decoupling analysis — vendored harness vs. alternatives

**Date:** 2026-08-27 · **Baseline:** `main@0fa7cc74` (post-consolidation closeout) · **Upstream pin:** `dsh-v0.1.1-rc.1` @ `528c682e` (`vendor/harness-upstream.json`)

**Kind:** architectural analysis (doc-only, no product-contract change; no feature card is touched). This document evaluates whether and how the DeepSeek Harness (`dsh`) could be decoupled from this Electron desktop shell.

**TL;DR verdict: defer wholesale decoupling.** The fork delta is too large and too deep in upstream internals for package-level or artifact-level decoupling to be honest engineering today. The repo already implements the strongest viable boundary (pin-based subtree sync + a machine-checked fork registry + real-CLI contract gates). Recommended: harden that boundary (Scenario C), keep upstreaming generic fixes (Scenario G, already practiced), and keep new capabilities out of the vendor tree as sidecar plugins (Scenario F, already the pattern for dsh-usage-panel / dsh-im / dshbot).

---

## 0. Measured fork delta (the number that drives everything)

Diffing the vendored tree against the upstream pin (`git diff 528c682e HEAD:vendor/deepseek-harness`, upstream tag fetched 2026-08-27):

| Metric | Value |
| --- | --- |
| Git-tracked files under `vendor/deepseek-harness` | 8,624 |
| Files changed vs. upstream pin | 1,372 (+91,734 / −3,449 lines) |
| Code-only (excl. `.agents` notes, READMEs, i18n/zh mirrors) | 1,015 files, +85,335 / −3,250 |
| Added files | 736 · Modified upstream files: **625** · Deleted: 3 |

Modified-upstream-file hotspots (count of `M` files): `apps/web` 110, `packages/client/ui-conversation` 44, `packages/client/ui-primitives` 26, `packages/host/apiproxy` 26, `packages/client/ui-workspace` 20, `packages/client/ui-theme` 19, `packages/client/runtime` 19, `packages/client/ui-layout` 16, `packages/client/ui-settings-models` 13, `packages/llm/llm` 11, `packages/client/connection` 11, `packages/core/session` 9, `packages/mcp/mcp-client` 9, `packages/session/session-persistence-sqlite` 8, `apps/cli` 8.

Interpretation: the desktop is **not** a consumer of harness with a few extension points bolted on. It is a standing fork whose edits reach the web app shell, the conversation renderer, the primitives library, the layout, the LLM/session/persistence cores, and the CLI argument grammar. That single fact eliminates most "clean dependency" decoupling shapes at the current delta size.

---

## 1. Coupling inventory

Ten surfaces, each with file evidence. Ordered roughly by how hard they would be to sever.

### 1.1 Vendor tree as a committed fork subtree

- 8,624 tracked files under `vendor/deepseek-harness/` (not a git submodule — full sources committed; `apps/web/dist`, `node_modules`, tsc droppings are gitignored, see `.gitignore`).
- Pin: `vendor/harness-upstream.json` (`repo`, `ref`, `sha`, `npm`), read by `src/shared/harness-upstream.js`.
- Sync: `npm run sync:harness` → `src/shared/harness-sync.js` — a purpose-built subtree merge: synthetic "ours" commit parented at `pin.sha` (`startSync`, lines 242–292), isolated conflict worktree with `--continue`/`--abort`, `assertPrefixOnly` guaranteeing the candidate tree touches only `vendor/deepseek-harness` (lines 173–182), then pin rewrite. **Scenario C machinery already exists and is tested** (`src/shared/harness-sync.test.js`).

### 1.2 Registered fork surface (the boundary ledger)

`src/shared/harness-desktop-forks.js` is the machine-checked registry of everything the desktop owns inside the vendor tree:

- `DESKTOP_PACKAGES` (lines 6–26): 20 whole packages — 13 client UI (`ui-titlebar`, `ui-git`, `ui-user-terminal`, `ui-surfaces`, `ui-files`, `ui-diff`, `ui-preview`, `ui-agents-panel`, `ui-message-edit`, `ui-settings-market`, `ui-settings-remote`, `ui-settings-mcp`, `ui-settings-skills`, `ui-directory-picker-browse`), 3 host (`mcp-servers`, `skill-inventory`, `directory-picker-browse`), plus `llm-vision-fallback` and `mcp-servers-file`.
- `COMPOSITION_ROWS` (lines 28–48): 19 insert rows the desktop added to **upstream-owned** bundle patch files (`packages/bundle/base/cordis.patch.yml`, `packages/bundle/web-app/cordis.patch.yml`).
- `FORK_FILE_MARKERS` (lines 55–84): ~20 file-level forks inside upstream packages that whole-package checks cannot see — `SettingsSelect` in `ui-primitives` and six settings rows, wallpaper fork on `ui-theme`, `--skip-user-plugins` in `apps/cli/src/args.ts`, forked e2e drivers, root `package.json` Ghostty copy step.
- Version lockstep: every desktop package's `version` must equal `pin.npm` (`assertDesktopForks`, lines 130–132), so fork packages version-track the upstream release, not the desktop app.

### 1.3 Process spawn / CLI grammar

`src/main/dsh.js`:

- `buildLaunch` (lines 634–717) supports three launch kinds: **source** (`apps/cli/lib/bin.js` under a resolved system/bundled Node), **dsh** (externally installed binary), **npx** (`@deepseek-ai/dsh@<pin.npm>`). The packaged product always takes the source kind against the extracted fork runtime.
- CLI grammar coupling: `--skip-user-plugins`, repeated `--patch <file>`, `--host/--port/--no-open` must sit in the CLI syntax prefix; `dsh.test.js` extracts the web-subcommand flag set from vendored `apps/cli/src/args.ts` so a vendor grammar change fails desktop tests immediately (desktop-launcher card invariant).
- Readiness protocol: stdout line `dsh web: <url>` (`readyUrlPattern`, line 400) plus HTTP reachability polling — a plain-text contract with the CLI.
- Pre-flight: `missingDesktopForkPackages` (lines 176–216) resolves all 20 `DESKTOP_PACKAGES` through the CLI/bundle require anchors before spawn; a missing in-box package is "desktop runtime damage" that skip-recovery must not attempt to fix.
- Child env contract: `src/shared/child-spawn-env.js` (shared by `dsh web` and `dsh plugin`) overwrites `DSH_HOME` to the desktop home, strips Electron vars, gates `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`; `spawnEnv` adds `DSH_HARNESS_ROOT` and the install-control endpoint (`DSH_DESKTOP_INSTALL_URL`/`_TOKEN` from `src/main/desktop-install-control.js`).

### 1.4 Patch overlays and profile composition

- `src/main/harness-controller.js` `performStartOnce` (lines 405–535) assembles `patchFiles`: `desktop-install.patch.yml` (every start), `desktop-dsh-im.patch.yml` (every start), `desktop-usage-panel.patch.yml` (full starts only). The profile `cordis.patch.yml` is purely user-owned; ensure strips legacy managed blocks and never writes back.
- The semantics ride on undocumented-but-pinned CLI behavior: `--patch` overlays still apply under `--skip-user-plugins`, and CLI `insert` does not dedupe by id. Both are locked by `scripts/check-skip-compose-contract.js` running the **real** CLI `dump-config` in two rounds (skip + full, with a user-layer canary and a managed-block migration replay), invoked from CI (`.github/workflows/test.yml` line 48) and from `scripts/after-pack.js` against the assembled packaged runtime.

### 1.5 IPC bridge (`window.shell`)

- `src/preload/index.js` exposes a role-gated API (`boot` / `harness` / `launcher`); the harness role (lines 70–169) spans ~120 methods: window chrome, config, marketplace, wallpaper catalog, git (status/stage/commit/push/branch/PR), workspace FS, PTY, preview/browser control, remote pairing.
- Consumed **inside the vendor tree** by 15+ packages (`window.shell` grep): `ui-user-terminal`, `ui-surfaces`, `ui-git`, `ui-files`, `ui-diff`, `ui-preview`, `ui-settings-market`, `ui-settings-remote`, `ui-settings-general`, `ui-layout/AppFrame`. This is the real API boundary between shell and web UI — but it is versioned by nothing except co-location; there is no published schema, only `docs/handbook/appendix/shell-api.md` and per-side tests.
- The desktop also injects window controls directly into the harness page (`src/main/harness-chrome-inject.js` via `executeJavaScript`), a DOM-level coupling to the official page structure.

### 1.6 Shared design tokens

`src/shared/dsh-webui-tokens.css` mirrors the official value table from `packages/client/ui-theme/src/styles/design-platform.css` (stated in its header comment) for surfaces that cannot import `ui-theme` (launcher, boot, installer bitmaps via `scripts/render-installer-assets.js`). Drift detection is manual. The design-language mandate (`AGENTS.md`, `docs/design-language.md`) requires `ui-primitives` + `--dsw-alias-*` everywhere, so any decoupling shape must keep token parity.

### 1.7 Sibling vendor packages (the already-decoupled tier)

| Package | Files | Coupling shape |
| --- | --- | --- |
| `vendor/dsh-usage-panel` | 5,951 (incl. committed `node_modules`) | Cordis plugin, mounted via desktop overlay, `extraResources` |
| `vendor/dsh-im` | 3,466 (incl. committed `node_modules`) | Cordis plugin, desktop built-in overlay (full+skip), `extraResources`; missing deps = fail start |
| `vendor/dshbot` | 18 | **npm-published standalone plugin** (`.github/workflows/publish-dshbot.yml`); desktop only cleans preset residue |
| `vendor/chisacode-remote` | 3,059 | Separate AGPL protocol stack; built/verified at pack time (`scripts/prepare-chisacode-remote.mjs`) |
| `vendor/dshmarket` | 3 | Attribution stub only (DROPPED) |

These prove the sidecar-plugin pattern works: capability packages that talk to the harness through the Cordis plugin API and to the desktop through overlays do **not** need to live inside `vendor/deepseek-harness`.

### 1.8 Build and setup

- `scripts/setup-harness.js`: clone at pin ref if absent (sha-verified), `pnpm install --frozen-lockfile`, `pnpm run build`, Ghostty asset ensure, plugin runtime-dep install for usage-panel/dsh-im.
- The vendor tree is a pnpm monorepo with its own toolchain (`vendor/deepseek-harness/pnpm-lock.yaml`, `tsconfig.client.json` — which must list every desktop client package, asserted by `assertDesktopForks`).

### 1.9 Release / packaging

- Packaged runtime is assembled from a pnpm **deploy** dir into `resources/vendor/deepseek-harness.tar` (`scripts/after-pack.js` `assembleFromDeploy`, line 589; version-isolation repair at line 531) and extracted on first run to `userData/runtime/<appVersion>` (`src/main/harness-extract.js`).
- `extraResources` (root `package.json` lines 65–93) ships usage-panel, dsh-im, chisacode-remote runtime; a bundled `node.exe` sits in resources (`bundledNodeBin`, `src/main/dsh.js` lines 57–70).
- after-pack gates: `assertHarnessVersions` (packaged harness version == `pin.npm`), `assertDesktopForkRuntime` (all 20 fork packages present with built entries), Ghostty assets, node-pty prebuild, and the skip-compose contract on the packaged CLI. The Windows installer invariants (artifact name, silent install, per-user layout) are bound in `docs/features/windows-installer.md`.

### 1.10 Test / CI

- `.github/workflows/test.yml`: desktop unit-test matrix, plus a **vendor-gui** job that pnpm-installs the vendor monorepo, builds client/host libs, runs the skip-compose contract on the real CLI, then runs the vendor `test:gui` suite (410 files / 5,373 tests per the marketplace card) and a client-catalog freshness check. Desktop CI is therefore also the fork's CI.
- `.github/workflows/release.yml` runs `setup-harness` + `npm run dist` + a blocking packaged smoke on `dist/win-unpacked`.

---

## 2. Decoupling scenarios

| # | Scenario | Feasibility | Effort (what must change) | Risk | Benefit |
| --- | --- | --- | --- | --- | --- |
| A | Status quo: vendored monorepo + in-tree forks | — (baseline) | — | Sync burden grows with delta | Everything co-located; contract gates run on real sources |
| B | Published harness npm packages; forks extracted | **Low** | Upstream must publish per-package + accept/expose seams for 625 modified files; desktop rebuilds web bundle from deps | Very high (fork loses source anchor; gates lose their subject) | Clean dependency graph — only after G shrinks the delta |
| C | Subtree + strict boundary + sync automation | **High (mostly done)** | Incremental: CI fork-delta report, sync dry-run automation | Low | Formalizes today's reality; cheapest risk reduction |
| D | Runtime-only coupling (prebuilt bundle artifact) | **Low–Medium** | Second repo/pipeline building the fork into release artifacts; desktop consumes tar | High (splits debug loop; contract gates go cross-repo) | Smaller desktop repo; faster desktop-only CI |
| E | Full product split (thin launcher + independent dsh) | **Low** | Abandon or upstream the entire client fork | Product regression (blueprint: stock `npx dsh` has no titlebar/git/surfaces/terminal) | Not a benefit at current product scope |
| F | Partial decoupling of specific surfaces | **Medium–High (selectively)** | Keep new capabilities as sidecar plugins; optionally move host-side fork packages out | Low–Medium per slice | Caps vendor-tree growth |
| G | Upstream absorption of forks | **Medium, continuous** | Per-slice upstream PRs (template exists) | Upstream acceptance uncertain for product-opinion slices | Directly shrinks the delta that blocks B/D/E |

### A. Status quo (baseline)

What it costs today: (1) every upstream sync is a 1,372-file merge surface — `sync:harness` mitigates with conflict isolation and `FORK_FILE_MARKERS`, but conflicts resolved toward upstream can silently drop desktop content that only file markers catch; (2) desktop CI carries the vendor monorepo build + 5,373 GUI tests; (3) the repo carries ~8.6k vendored files plus two committed `node_modules` trees (dsh-usage-panel, dsh-im). What it buys: contract gates (`check-skip-compose-contract.js`, the `args.ts` grammar test, `assertDesktopForks`) all run against the **actual sources that ship**, and a single PR can change shell + fork + contract in one reviewable diff — which is how all 12 consolidation PRs landed.

### B. Published npm packages

The Cordis architecture (see `vendor/deepseek-harness/docs/architecture.md`: "every part of the product is a plugin… no privileged core to patch") superficially suggests the desktop could be a set of out-of-tree plugins against published `@deepseek-ai/*` packages. That holds for the 20 `DESKTOP_PACKAGES` — they are additive plugins. It does **not** hold for the 625 modified upstream files: `SettingsSelect` woven through `ui-primitives` and six settings packages, the wallpaper fork on `ui-theme`, layout slots in `ui-layout` (`LAYOUT_MARKERS`: `surfaces`, `shell.titlebar.trailing`, `shell.terminalDrawer`), 44 modified files in `ui-conversation`, 110 in `apps/web`, and the CLI flag in `args.ts`. Those are seam-less edits; consuming published packages would require upstream to either merge them (that is Scenario G) or grow extension points for each. Additionally, `apps/web/dist` is compiled from the monorepo — a published-package consumer would still need to rebuild the web app from forked inputs, i.e. a fork by another name. **Not viable at the current delta. Revisit only after G reduces modified-upstream-file count to a level where remaining edits map to upstream-accepted extension points.**

### C. Git subtree with a strict boundary (≈ current state, hardened)

Already implemented: pin file, sha-verified clone, synthetic-ours subtree merge with `--dry-run`/`--continue`/`--abort`, prefix-only assertion, `assertDesktopForks` as the boundary ledger, and CI contract gates on the real CLI. Gaps worth closing (low effort, real payoff):

1. **Fork-delta telemetry**: a script that classifies the diff vs. pin into (a) registered whole packages, (b) `FORK_FILE_MARKERS` files, (c) *unregistered* modifications — and fails or reports when (c) grows. Today `FORK_FILE_MARKERS` is curated by hand; the 625-file measurement above suggests unregistered drift already exists beyond the marker list (markers cover ~20 files).
2. **Scheduled sync dry-run** against upstream `main`/latest tag (the fetch works from CI runners; verified during this analysis), reporting conflict count so upgrades are priced continuously instead of discovered at pin-bump time.
3. **Fork-note discipline**: agent notes under `vendor/deepseek-harness/.agents/notes/implemented/` already document most slices; linking each `FORK_FILE_MARKERS` entry to its note would make conflict resolution reviewable.

### D. Runtime-only coupling (prebuilt bundle, no vendor sources in repo)

The runtime shape half-exists: packaged builds already run from a prebuilt archive (`deepseek-harness.tar` → `userData/runtime/<version>`), and `DshManager` can drive an external `dsh` binary. A full move would put the fork in a separate repo producing versioned artifacts, with this repo consuming them. Costs that make it a net loss today: (1) the desktop's most valuable gates read fork **sources** — the `args.ts` grammar test and skip-compose contract would become cross-repo integration tests with version-matrix pain; (2) day-to-day product work is fork work (see the feature cards' Allowed-touch lists: marketplace, remote, dsh-home all name `vendor/deepseek-harness/packages/client/...` paths), so every feature would become a two-repo, two-PR dance; (3) source-mode development (`npm start` against the vendored tree, `smoke:source`, `qa:source`) would need an artifact-unpack replacement. The genuine benefits (repo size, desktop-only CI speed) are real but do not outweigh breaking the single-diff workflow while the fork is this active.

### E. Full product split (thin launcher + independently installed harness)

`buildLaunch` already supports external `dsh` and `npx` kinds, so the mechanics of "shell an independent install" exist as a fallback. But the blueprint is explicit that the npx official package lacks the desktop titlebar / Git / surfaces / bottom terminal — i.e. **the product is the fork**, not the shell. The Windows installer contract also ships the bundled harness + `node.exe` (users must not need a Node install). A VS-Code-style split only becomes meaningful if Scenario G first lands the client fork upstream (or upstream grows equivalent capability), after which E collapses into B. Not a current option.

### F. Partial decoupling (selective surfaces)

The proven pattern — and the correct standing policy:

- **Already decoupled**: dshbot (npm-published, desktop only cleans residue), chisacode-remote (own protocol stack, AGPL-isolated), dsh-usage-panel and dsh-im (sidecar Cordis plugins mounted via desktop-owned overlays, never merged into the vendor tree).
- **Extractable with medium effort**: the pure host-side fork packages (`packages/host/mcp-servers`, `host/skill-inventory`, `mcp/mcp-servers-file`, `llm/llm-vision-fallback`) have no compiled-into-web-bundle constraint and could become overlay-mounted sidecars like usage-panel. Benefit is modest (they are small and stable); cost is new overlay rows, forensics `IN_BOX_PACKAGE_NAMES` updates, and packaging changes. Do this opportunistically, not as a program.
- **Not extractable**: client UI fork packages were deliberately integrated into the web-app bundle (PR #53 "integrate built-ins into web-app bundle") so that in-box UI loads with the app and skip-recovery semantics stay sane (`DESKTOP_PACKAGES` missing = runtime damage, not a disable-able user plugin). Runtime-mounting them back out would reopen the exact failure class the D-series work closed. Modified-upstream-file forks (`ui-primitives`, `ui-layout`, `ui-conversation`, `apps/web`) cannot be extracted at all — only upstreamed (G).
- **Rule going forward**: new desktop capability defaults to a sidecar plugin outside `vendor/deepseek-harness` unless it must modify upstream code; when it must, it registers in `harness-desktop-forks.js` (already the observed practice, e.g. the marketplace-settings card's Deferred section mandates "new desktop fork package + IPC, new feature card" for revivals).

### G. Upstream absorption

Already practiced and templated: [2026-08-27-dsh-tools-upstream-handoff.md](2026-08-27-dsh-tools-upstream-handoff.md) packages the malformed-tool-call fix (llm / agent-loop / session / tools / persistence — all in packages carrying **no other desktop edits**) for an upstream PR, with the pin-update rule ("never pin a pending PR") and the post-merge fork-drop step. The fork delta splits into three absorption classes:

1. **Generic fixes** (LLM robustness, MCP client fixes, terminal/ConPTY fixes, session-persistence hardening — see `.agents/notes/implemented/bug-fix/`): upstreamable and should ship continuously; each acceptance shrinks the modified-file count that blocks B/D.
2. **Reusable capability seams** (directory-picker capability seam, `--skip-user-plugins` CLI flag, layout slots): plausibly upstreamable as opt-in extension points; the flag and the slots are exactly the seams B would need.
3. **Desktop product opinion** (titlebar, surfaces work loops, market section, wallpaper, SettingsSelect restyle): upstream may reasonably not want these; they stay desktop-owned regardless of scenario.

Constraint: the vendored tree currently fails 7 upstream keyless snapshot tests unrelated to desktop work (noted in the handoff doc), so per-slice hygiene (delta-neutral snapshots) is part of the template.

---

## 3. Blockers and invariants (what decoupling may NOT break)

From the Feature Spine (`docs/features/`), these are shipped contracts any scenario must preserve:

1. **desktop-launcher**: desktop-owned rows mount ONLY via `--patch` overlays; skip compose is gated by the real packaged CLI (after-pack); launcher flags must stay in the CLI grammar prefix, pinned by the `args.ts`-derived test — any scenario that removes vendored `args.ts` sources must replace that gate with an equivalent contract on the artifact.
2. **dsh-home**: desktop `DSH_HOME` = `userData/dsh-home` only; `dsh web`/`dsh plugin` children get it overwritten; never touch `~/.dsh`. Independent-install scenarios (E) inherently strain this: an externally installed dsh serving the desktop must still be spawned with the desktop home.
3. **marketplace-settings**: the market is desktop-owned code — `ui-settings-market` **inside the vendor tree** registered in `harness-desktop-forks.js`, engine in main-process. Extraction to a runtime-installed plugin would demote it to a disable-able user plugin and break the `DROPPED`/`inBox` forensics semantics.
4. **remote-settings / mobile-remote**: `ui-settings-remote` is a vendor fork package; dsh-im is a desktop built-in whose vendor runtime damage must fail start (skip cannot fix). Decoupling dsh-im further than today would need a new damage-vs-user-plugin story.
5. **Design language**: `--dsw-alias-*` + `ui-primitives` reuse is mandatory; token parity between shell surfaces and the harness web UI must survive any repo split (today it is a hand-mirrored file, `src/shared/dsh-webui-tokens.css`).
6. **windows-installer**: Setup ships the built harness runtime + bundled Node; artifact naming and the blocking packaged smoke stay in the release chain. Runtime-artifact scenarios (D) must keep `assertHarnessVersions`/`assertDesktopForkRuntime` equivalents on the consumed artifact.
7. **Skip-user-plugins recovery FSM**: unchanged by mandate (dsh-home card). Any composition change re-runs the full contract (skip/full rounds, exactly-one rows, migration replay).

---

## 4. Migration paths (if decoupling is pursued)

Phased so every phase is independently valuable and reversible; no phase starts until the previous phase's gate is green.

**Phase 0 — instrument the boundary (no behavior change).**
Prereqs: none. Work: fork-delta classifier script (diff vs. pin → registered / marked / unregistered buckets) + CI report; scheduled upstream sync dry-run. Gate: report exists, unregistered-drift count is known and triaged. Rollback: delete the report job.

**Phase 1 — continuous upstream absorption (Scenario G).**
Prereqs: Phase 0 telemetry to pick clean slices. Work: per-slice upstream PRs using the dsh-tools handoff template; after each upstream release, `sync:harness` and drop superseded fork edits. Gate per slice: upstream merge + tag, pin bump PR green on the full desktop suite (`npm test`, skip-compose, `smoke:source`, vendor `test:gui`). Rollback: pin stays put (never pin a pending PR — existing rule).

**Phase 2 — sidecar-by-default policy + opportunistic host-package extraction (Scenario F).**
Prereqs: none (policy already de facto). Work: write the rule into the feature-card template; when a host-side fork package next needs real changes, evaluate moving it to an overlay-mounted sidecar instead. Gate: skip-compose contract extended with the new overlay row (exactly-once), forensics `inBox` list updated. Breaking change: none for users. Rollback: re-integrate the package into the bundle (the PR #53 pattern is documented).

**Phase 3 — re-evaluate artifact/package decoupling (Scenarios D/B).**
Trigger condition, not a date: modified-upstream-file count (Phase 0 metric) drops below a threshold where remaining edits map to upstream extension points (order of ~50 files, dominated by class-3 product opinion), **and** upstream publishes stable per-package releases. Work then: extract the fork into its own repo with the same pin/sync machinery, produce versioned runtime artifacts, port the three contract gates (args grammar, skip-compose, fork-runtime assert) to run against the artifact in desktop CI. Breaking changes: contributor workflow (two repos), source-mode dev loop. Rollback: the subtree merge machinery can re-absorb the fork repo at any commit (it is the same tree shape).

**Explicitly not planned:** Scenario E (thin launcher over independent dsh) — it is a product downgrade at current upstream capability, not a refactor.

---

## 5. Recommendation

**Defer wholesale decoupling; formalize the boundary; keep shrinking the delta.**

- **Pursue now (cheap, high value):** Phase 0 fork-delta telemetry + scheduled sync dry-runs; continue Scenario G per-slice upstreaming (the template and the first slice already exist); adopt the sidecar-by-default rule for new capability.
- **Defer:** Scenarios B and D until the Phase 3 trigger condition holds. The current fork (+85k code lines, 625 modified upstream files across apps/web, ui-conversation, ui-primitives, ui-layout, llm, session cores) makes any dependency-shaped decoupling either dishonest (a fork rebuilt elsewhere) or destructive to the contract gates that keep releases safe.
- **Reject:** Scenario E at current product scope.

The specific strength worth protecting: this repo's safety comes from **contract gates that run against the exact sources/artifacts that ship** (`check-skip-compose-contract.js` on the real CLI in both CI and after-pack; the `args.ts` grammar test; `assertDesktopForks` + `assertDesktopForkRuntime` at both ends). Any future decoupling must move these gates with the boundary, never delete them.

## 6. Risks and open questions

1. **Unregistered fork drift**: `FORK_FILE_MARKERS` covers ~20 files while 625 upstream files are modified. Most of the gap is presumably intentional (large feature slices documented in agent notes), but nothing machine-verifies that today — Phase 0 closes this.
2. **Upstream cadence unknown**: the pin is an RC (`0.1.1-rc.1`). If upstream moves fast toward 1.0 with breaking Cordis/CLI changes, sync cost rises and strengthens the case for G-first; if upstream stalls, the fork is effectively the product and decoupling pressure drops further.
3. **Upstream appetite for seams**: `--skip-user-plugins`, layout slots, and the directory-picker seam are the desktop's best candidates for class-2 upstreaming; whether upstream accepts them determines if Scenario B is ever reachable.
4. **Committed `node_modules`** in dsh-usage-panel/dsh-im is a repo-hygiene cost independent of harness decoupling; lockfile-driven install at setup/pack time could replace it, but that is a packaging task, not a decoupling one.
5. **Token mirror drift** (`dsh-webui-tokens.css` vs. `design-platform.css`) has no automated check; a small comparator test would close it in any scenario.
