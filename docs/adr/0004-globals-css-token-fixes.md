# ADR 0004 — globals.css token fixes

- Status: accepted · Date: 2026-10-15 · Spec: SPEC-14 §2, PR 2 · Architecture: §12.2, §12.3, C7, INV-66

## Context

ARCHITECTURE §12.2 carries the legacy `globals.css` over verbatim, with one ADR listing the token-parity and
definition fixes: dark badge text tokens, tokens referenced but never defined, tertiary/placeholder contrast to
4.5:1, one focus-ring token, light warning contrast, and dead blocks. This is that ADR.
`apps/web/src/styles/globals.css` equals the legacy file except for the changes below; `diff --strip-trailing-cr`
against the legacy file shows only them, plus the `--font-sans` declaration that
the repo formatter (Oxfmt, 120 columns) joins onto one line.

Contrast is the WCAG 2.2 ratio. Each new colour is the legacy colour mixed toward black (light theme) or white
(dark theme) in 0.5% steps until it reaches the target, so the hue stays the same.

## Decision

1. **Dark badge text tokens.** `.dark` gains `--text-success-badge: #86efac`, `--text-warning-badge: #fcd34d` and
   `--text-info-badge: #93c5fd` (the dark `--text-success/-warning/-info` values). Before, dark badges used the light
   values: dark green, brown and navy text on dark tints.
2. **Referenced but undefined.** `@theme` builds `--font-sans`, `--font-display` and `--font-mono` from
   `--font-public-sans`, `--font-bricolage-grotesque` and `--font-jetbrains-mono`, which `next/font` used to inject.
   `:root` now defines them as the `@fontsource-variable` family names, and the `@theme` comment says so. No other
   `var(--…)` in the file is undefined.
3. **Tertiary and placeholder contrast.** Each reaches 4.5:1 on `--surface-sunken`, the darkest surface it sits on,
   and so on every lighter one.

   | Token                        | Legacy    | Now       | On sunken / background / surface                    |
   | ---------------------------- | --------- | --------- | --------------------------------------------------- |
   | `--text-tertiary` (light)    | `#7f7a72` | `#66625c` | 4.64 / 5.09 / 6.06 (was 3.26 / 3.58 / 4.26)         |
   | `--text-placeholder` (light) | `#948f86` | `#68645e` | 4.50 / – / 5.88 (was 2.46 / – / 3.21)               |
   | `--text-tertiary` (dark)     | `#5e5c57` | `#85837f` | 4.61 on elevated, 4.79 on surface (was 2.61 / 2.71) |
   | `--text-placeholder` (dark)  | `#5e5c57` | `#85837f` | as tertiary (legacy kept them equal)                |

   The light comment table above the text tokens is updated to the new values.

4. **One focus-ring token.** `:root` defines `--focus-ring: var(--primary)`; the base `:focus-visible` rule draws a
   2px `--focus-ring` outline with a 2px offset. Legacy drew a 3px `--primary-muted` glow (1.29:1 on white, below
   the 3:1 non-text minimum), and `.erp-select:focus` added its own 2px `--primary-muted` glow, now removed so the
   one ring shows. `--primary` is 6.97:1 on the light surface and 5.33:1 on the light sunken surface; dark, 4.93:1 on
   the surface and 4.28:1 on the secondary fill. `.dark` needs no value: `var(--primary)` resolves to the dark primary on the same element.
5. **Light warning contrast.** `--warning` `#b45309` → `#ac4f09` (4.55:1 on the `#ecebea` page background, was 4.22)
   and `--warning-contrast` `#1a1917` → `#ffffff` (text on a warning fill: 5.42:1, was 3.50). The dark warning
   tokens already pass.
6. **Dead blocks removed.** Classes that no legacy component, page or hook uses, with the keyframes only they used:
   - the whole "Glass Morphism & Mesh Gradient" utilities layer (`bg-mesh-gradient*`, `glass-*`, `glow-accent`,
     `text-gradient-primary`, `theme-transition`, `@keyframes mesh-shift`), which `DESIGN.md` already barred;
   - the `.compact` overrides: nothing sets a `compact` class (density is a component prop), and two of them used
     `!important` (C7);
   - `status-dot*`, `table-container`, `form-section*`, `form-label`, `loading-container`, `loading-spinner`
     (`@keyframes spin`), `erp-card-soft`, `erp-card-header`, `text-disabled`, `text-2xs`, `text-excel`, `bg-pdf`,
     `border-pdf`, `bg-word`, `border-word` and their hover variants, `animate-*` (`@keyframes slide-up`,
     `slide-down`, `pulse-subtle`, `shimmer`, `page-enter`), `focus-ring*`, `hover-surface*`, `active-surface`,
     `container-main`, `section`, `section-header`, `filter-strip-appear`, `app-shell-content`, `page-header`,
     `stats-grid`, `kpi-card`, `sidebar-section-label`.

   Every token stays, and so do all `role-*` classes (the typography system) and the `fade-in`, `fade-out` and
   `scale-in` keyframes, which legacy components use.

Not changed: every other token and rule. Legacy components also use utility colour names that no `--color-*` token
defines, so they rendered with no colour; the new components use the defined token instead, and add no alias:

| Legacy class name                                  | Use instead                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `*-destructive`, `*-app-status-error`              | `*-error` (`--color-error`)                                           |
| `*-app-surface`, `*-app-surface-hover`             | `*-surface`, `*-surface-sunken`                                       |
| `*-app-border`, `border-hairline`                  | `border-border`, `border-border-subtle`                               |
| `text-action-primary`, `ring-ring`, `outline-ring` | `text-primary`; focus comes from `--focus-ring`                       |
| `text-placeholder`                                 | `placeholder:text-[var(--text-placeholder)]`                          |
| `text-tertiary/50`, `bg-text-tertiary`             | `text-subtle/50`, `bg-subtle` (`--color-subtle` is `--text-tertiary`) |
| `text-*-foreground`                                | `text-*-contrast`                                                     |
| `text-accent-hover`                                | `hover:text-accent-hover` (as defined)                                |

## Consequences

- `globals.css` changes only through a new ADR (C7, INV-66). The token-parity test
  (`apps/web/test/tokens.test.ts`) fails when a `:root` colour token has no `.dark` value; the design validators
  (SPEC-14 PR 3) reject utility colours with no token.
- Placeholder and tertiary text are darker in light mode and lighter in dark mode than legacy, and keyboard focus
  shows a solid blue outline instead of a pale glow. Both are visible differences allowed as consistency and
  accessibility fixes (D-0016).
- Reversing any item is a one-line token change in a new ADR.
