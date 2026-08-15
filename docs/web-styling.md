# Web UI style reference

English | [中文](web-styling.zh.md)

This reference defines styling ownership and component rules for browser client packages. The current token values live in [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); this document does not duplicate that generated-by-source inventory.

## Ownership

[`ui-theme`](../packages/client/ui-theme/README.md) owns the `--dsw-*` static scale, semantic aliases, typography, motion, gradients, shadows, scrollbar styles, and light/dark preference. [`ui-layout`](../packages/client/ui-layout/README.md) applies the resolved theme snapshot to the document. Feature packages consume semantic aliases and do not define another global theme.

Global style sheets belong in `ui-theme/src/styles/`. Component styles live beside their component as CSS Modules. A component may define a local custom property when its value is part of that component's layout or presentation contract; shared colors, typography, elevation, and motion belong to the theme package.

## Component rules

- Use CSS Modules and `clsx`; do not add a component library or Tailwind.
- Use `--dsw-alias-*` semantic tokens in feature components. Do not copy static palette values or write literal colors there.
- Keep theme selectors out of feature component CSS. Light/dark overrides belong to the theme owner.
- Pair font sizes with line heights and use the theme typography variables when an existing role matches.
- Keep source text, terminal output, and diff lines unwrapped when their component contract requires column preservation; use the shared scrollbar styles rather than component-specific scrollbar selectors.
- Put presentation in CSS. Inline React styles may pass component-local custom-property values but must not encode theme branches.
- Preserve keyboard focus visibility and reduced-motion behavior when adding transitions or hover-only controls.

## Motion

Shared enter/exit motion lives in [`ui-theme` `motion.css`](../packages/client/ui-theme/src/styles/motion.css) and [`usePresence`](../packages/client/ui-primitives/src/usePresence.ts). Overlay, popover, fade, swap, and flip recipes animate only `opacity` and `transform`. A surface sets `data-dsh-motion` and `data-state` from `usePresence`; it does not invent another duration or easing. The composer plus, permission, model, and context-meter popovers all use `popover`. `FlipText` plays the 400ms flip recipe (`--ds-motion-duration-flip`) when a permission, model, or effort trigger label changes. `prefers-reduced-motion: reduce` zeros the `--ds-transition-duration*` and `--ds-motion-duration-*` tokens. Do not animate `backdrop-filter`, large-panel width/height, or add an animation library. New dialogs, menus, and in-place swaps reuse a primitive or the same hook and recipe. Rationale: [the motion-system Agent Note](../.agents/notes/implemented/architecture/2026-08-14-web-motion-presence-and-recipes.md).

## Changing the system

Add or change a shared token in the owning `ui-theme` sheet, then consume its semantic alias from feature packages. Update the owning package reference when a public styling contract changes. Visual behavior follows the [testing policy](testing.md). Motion recipes, Presence, and FlipText are pinned by their package suites under `test:gui` and by role / `aria-hidden` close assertions, not by browser goldens. The [styling-system Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.md) records framework rationale.
