# Agent Note: Skills settings grouping and open-directory actions

Status: implemented

English | [中文](2026-08-23-skills-settings-grouping.zh.md)

## Problem

The Skills settings page renders every discovered skill as one flat searchable list, so a catalog with many skills has no way to organize them visually, and a user who wants to inspect or edit a skill's files (`SKILL.md` plus bundled resources) must locate the directory by hand in the OS file manager.

## Decision

Each skill carries a Settings-owned grouping label in frontmatter, the page renders rows as a collapsible group tree with per-group enablement, and each row exposes an "open directory" action.

Storage: the label lives under the filesystem provider's open `metadata` object as `metadata.group`. The filesystem provider already surfaces `metadata` on `SkillDefinition` without a schema change, so `@deepseek-ai/dsh-host-skill-inventory` reads it in `list`/`get` and writes it through `renderSkillMarkdown`, which merges `group` into the existing `metadata` object: a non-empty trimmed value sets the key, an explicit empty string deletes the key (and drops the `metadata` key when nothing remains), and a non-object `metadata` value is left alone unless a group is being written. An omitted `group` in `update` means "not part of this write" and preserves the current label; `create` treats an absent group as empty. `setInvocation` never touches it. The wire types gain `group?` on `SkillInventoryEntry`, `SkillInventoryDetail`, and the create/update requests, and `directory?` on entries (`dirname` of the skill file path, computed Host-side so Windows separators stay correct).

Presentation: the client groups filtered rows by label in first-appearance order, with ungrouped rows in a final "ungrouped" node; when no filtered row carries a label the list stays flat. Each group renders as a tree node: a disclosure header (label + count, `aria-expanded`) whose children indent under it; expand state is component state remembered in sessionStorage per group label, defaulting to expanded, and corrupt or non-object stored state degrades to defaults. Each node carries a model-invocation switch that batch-toggles every writable skill in the group through the existing per-skill `setInvocation` Remote (persisted per skill); the switch reads checked only when every writable member is enabled, disables while a batch is in flight or when the group has no writable skills, disables the whole node for all-readonly groups, and turning it off collapses and dims the node while rows stay reachable and individually editable. Per-row failures surface on the row like the single-row switch; late batch outcomes after a session switch are ignored. The create/edit dialog's group input is an editable combobox: a Menu listing the catalog's distinct group labels (plus a "leave blank" clear row) anchored to a free-text Input, so picking an existing label or typing a new one both work; search matches the label. Rows whose entry has a `directory` render a folder icon that calls the injected `openDirectory`, wired to `ctx.workspaces.openPath(directory)` — the existing `host.openPath` seam (OS default handler; on desktop the surfaces intercept keeps its usual in-workspace behavior).

## Alternatives considered

**A first-class `category` field in the core skill packages** — rejected. It would touch `SkillSummary`/`SkillDefinition` and the filesystem parser with model-visible and snapshot risk for a settings-only concept. `metadata` is the sanctioned open container and already round-trips through discovery, load, and write.

**Directory-based implicit grouping** — rejected. The label is explicit frontmatter the user controls; deriving groups from source directories would surprise and would need a second concept to be reorderable.

**A new Remote for opening directories** — rejected. `host.openPath` already opens a path with the OS default handler; a second seam would duplicate its gating and WSL/browser handling.

**A heading-level "open skills root" button** — rejected in favor of per-row directories. Each skill's own directory is the useful target for inspecting and editing its files.

## Consequences

- Grouping is invisible to the model: the label rides provider `metadata`, which the model-facing catalog never renders.
- Unknown frontmatter stays intact: `renderSkillMarkdown` preserves sibling metadata keys and non-owned fields, and clearing the label never clobbers a non-object `metadata` value.
- One open seam remains: `workspaces.openPath` is the same seam every other open-path caller uses, so desktop intercepts (in-app Files for in-workspace paths, OS file manager outside) apply uniformly.
- The tree is derived in the component from the loaded snapshot with sessionStorage-only viewing state; no new client store or host endpoint was added, and group toggles reuse the per-skill `setInvocation` Remote one call per writable member.

Related: [MCP and skill settings](../2026-08-14-mcp-and-skill-settings.md).
