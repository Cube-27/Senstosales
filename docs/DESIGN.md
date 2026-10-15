# Design system

Calm enterprise shell with a warm stone palette, theme-following sidebar, compact controls, and disciplined data
surfaces, tuned for operators running long ERP sessions on a local desktop. Carried over from the legacy app
(SPEC-14 PR 2); `apps/web/src/styles/globals.css` is the runtime source of truth, and its tokens change only through
an ADR ([ADR 0004](adr/0004-globals-css-token-fixes.md) lists the changes made in the carry-over).

## Direction

SenstoSales runs a **calm enterprise** system with a sharper visual identity than v1:

- **Linear/Vercel influence:** disciplined surfaces, low chrome, high clarity
- **SAP/Fiori influence:** strong tables, structured forms, clear status language, operational density where it matters
- **Local operator bias:** readability first, low surprise, large enough controls, light content theme by default

This is not a marketing UI. This is a working desktop ERP.

## Core principles

1. **Clarity beats personality**
   Labels, values, actions, and status must scan in seconds.
2. **Light content, light shell**
   The whole shell — sidebar, top bar, and content — runs on the same warm-stone surface tokens. Dark mode flips them together. The eye anchors on data, not chrome.
3. **Shared primitives first**
   Fix `Button`, `Input`, `DataTable`, `StatCard`/`StatCardRow`, headers, and shell before touching module-level JSX.
4. **Data surfaces stay disciplined**
   Tables, forms, filters, and detail panes carry the product. They must feel steady and consistent.
5. **Motion is functional**
   Hover, focus, loading, and expand/collapse only. No decorative drift, lift, mesh, or glass theatrics.

## Visual thesis

The product should feel like:

- a modern enterprise console around the edges
- a dependable ERP in the center
- calm, direct, and easy to operate for long sessions

Avoid:

- glass morphism on primary surfaces
- blue-tinted dark canvases
- decorative gradients on KPI cards
- tiny uppercase labels everywhere
- playful motion on routine controls
- “AI SaaS” dashboard chrome

## Fonts

Runtime fonts, self-hosted as `@fontsource-variable` packages imported in `apps/web/src/main.tsx` (variable weights,
so every `role-*` weight is available):

- **Display:** `Bricolage Grotesque` via `--font-display` / `--font-bricolage-grotesque` (page titles, headings, KPI emphasis)
- **Body / UI:** `Public Sans` via `--font-sans` / `--font-public-sans` (body text, labels, helper text, tables, forms, buttons)
- **Mono:** `JetBrains Mono` via `--font-mono` / `--font-jetbrains-mono` (IDs, PO numbers, invoice refs, material codes, aligned numerics)

Rules:

- Use `--font-sans` for routine UI and reading text
- Use `--font-display` for headings and metric emphasis only
- Use `--font-mono` for IDs, PO numbers, invoice refs, material codes, code blocks, and aligned numerics
- Use `role-currency-symbol` for the rupee symbol; it intentionally uses sans, not mono, so currency values do not look mechanically spaced
- Do not document or introduce fonts not actually loaded in `apps/web/src/main.tsx`

## Typography scale

Base reading text should not feel compressed.

| Role           | Token                | Usage                              |
| -------------- | -------------------- | ---------------------------------- |
| Page title     | `role-page-title`    | major page identity                |
| Page subtitle  | `role-page-subtitle` | one-line orientation text          |
| Section title  | `role-section-title` | compact section label, table group |
| Table header   | `role-table-header`  | column labels (uppercase, 12px)    |
| Table cell     | `role-table-cell`    | default data rows                  |
| Field label    | `role-field-label`   | form labels                        |
| Helper text    | `role-helper-text`   | support copy, validation hints     |
| KPI value      | `role-kpi-*`         | mono StatCard numeric values       |
| Reference link | `role-reference-*`   | PO/DC/Invoice/SRV numbers, codes   |

Rules:

- Prefer sentence case for page text
- Reserve uppercase for compact labels, table headers, and nav group labels
- Keep `role-*` classes authoritative; do not add local weight/size overrides on top

## Color system

The palette is **warm stone**: light surfaces lean off-white with a warm gray cast, dark mode uses solid charcoal/stone surfaces, and primary blue is the only action accent.

### Light theme

| Token           | Value                 | Use                                              |
| --------------- | --------------------- | ------------------------------------------------ |
| Background base | `#ecebea`             | page canvas                                      |
| Surface         | `#ffffff`             | cards, modals, primary content                   |
| Sunken          | `#e3e1dd`             | inputs, segmented control track, fills           |
| Hover surface   | `#f3f2ef` / `#e3e1dd` | quiet row/control hover states                   |
| Border          | `#d4d1ca`             | default borders                                  |
| Border subtle   | `#dedbd5`             | quiet dividers and nested context panels         |
| Border strong   | `#b8b3aa`             | input hover borders, stronger dividers           |
| Border focus    | `#0057b3`             | focus ring (`--focus-ring`), active input border |
| Text primary    | `#1a1917`             | values, headings                                 |
| Text secondary  | `#56524d`             | labels, supporting copy                          |
| Text tertiary   | `#66625c`             | captions, low-emphasis metadata                  |
| Placeholder     | `#68645e`             | input placeholders                               |
| Text disabled   | `#aaa59d`             | disabled controls                                |
| Primary         | `#0057b3`             | save / create / submit / confirm                 |
| Primary hover   | `#004899`             |                                                  |
| Primary text    | `#ffffff`             | text on primary fill                             |

### Dark theme (content)

Dark mode is a real, supported alternative. It must look like solid dark stone, not blue cinema.

| Token           | Value                       | Use                                       |
| --------------- | --------------------------- | ----------------------------------------- |
| Background base | `#0e0e0c`                   | page canvas                               |
| Surface         | `#161614`                   | cards, modals                             |
| Sunken          | `#0a0a09`                   | inputs, recessed surfaces                 |
| Hover surface   | `#232320` / `#2a2a27`       | quiet control/menu hover states           |
| Border          | `#2a2a27`                   | default borders                           |
| Border subtle   | `rgba(255, 255, 255, 0.06)` | quiet dividers                            |
| Border strong   | `#3a3a36`                   |                                           |
| Border focus    | `#3b82f6`                   | focus ring (`--focus-ring`)               |
| Text primary    | `#e8e6e1`                   |                                           |
| Text secondary  | `#9e9b94`                   |                                           |
| Text tertiary   | `#85837f`                   |                                           |
| Placeholder     | `#85837f`                   | input placeholders                        |
| Text disabled   | `#3e3c38`                   | disabled controls                         |
| Primary         | `#3b82f6`                   | action accent (lighter for dark contrast) |

### Sidebar

The sidebar follows the active theme — it is **light** in light mode and dark in dark mode (driven by the same `--surface` / `--text-*` tokens as the rest of the shell). It is not an always-dark anchor surface.

Sidebar tokens (consumed by `SidebarNav.tsx`):

| Token                | Light value                                               | Dark value            | Use                         |
| -------------------- | --------------------------------------------------------- | --------------------- | --------------------------- |
| `--sidebar-panel-bg` | `var(--surface)`                                          | `var(--surface)`      | sidebar canvas              |
| Inactive item text   | `text-foreground/75`                                      | `text-foreground/75`  | normal nav items            |
| Active item text     | `var(--text-primary)`                                     | `var(--text-primary)` | selected item               |
| Active item fill     | `bg-primary/10`                                           | `bg-primary/10`       | selected item background    |
| Active rail accent   | `var(--primary)`                                          | `var(--primary)`      | 3px left rail on active row |
| Section label        | `var(--text-secondary)` (uppercase, `role-section-title`) | same                  | group label                 |

### Status families

Each status uses a coordinated `bg / border / text` triplet. Backgrounds are light tints; text passes contrast; borders give the badge a clean edge.

| Status     | Light bg / border / text          | Dark bg / border / text             | Use                  |
| ---------- | --------------------------------- | ----------------------------------- | -------------------- |
| Pending    | `#fffbeb` / `#fcd34d` / `#92400e` | `#1c1500` / `#78350f` / `#fcd34d`   | warning / pending    |
| Dispatched | `#eff6ff` / `#93c5fd` / `#1e3a8a` | `#070d1c` / `#1e3a8a` / `#93c5fd`   | informational        |
| Delivered  | `#f0fdf4` / `#86efac` / `#14532d` | `#061208` / `#14532d` / `#86efac`   | success              |
| Rejected   | `#fef2f2` / `#fca5a5` / `#991b1b` | `#1c0a0a` / `#7f1d1d` / `#fca5a5`   | error / blocked      |
| Neutral    | `#e3e1dd` / `#d4d1ca` / `#56524d` | `#0a0a09` / transparent / `#9e9b94` | tag, draft, GEMC etc |

Rules:

- One action accent only: primary blue
- Status colors are for status, not decoration
- Do not introduce extra accent palettes per module

## Shadows

Shadows are quiet and tokenized. They separate dense surfaces without adding a floating dashboard feel.

| Token                 | Use                                       |
| --------------------- | ----------------------------------------- |
| `--shadow-card`       | tables, StatCard rows, steady panels      |
| `--shadow-card-hover` | clickable metric hover or panel emphasis  |
| `--shadow-elevated`   | elevated overlays and high-priority panes |
| `--shadow-dropdown`   | menus, selects, popovers                  |

Rules:

- Use shadow tokens only; do not hand-author page-local shadow stacks
- Hover may change background and shadow, but routine controls should not lift on hover
- Dark mode shadows may include a subtle one-pixel light edge for separation

## Spacing and sizing

Desktop-first, compact by default. Controls should be easy to hit and read for long sessions without wasting table space.

- Header height: `48px` (`--header-height: 3rem`)
- Sidebar width: `224px` (`--sidebar-width: 14rem`), collapsed width `64px`
- Default control height: `32px` for shared `Button`, `Input`, and `Select`
- Large control height: `36px`
- Compact utility height: `28px`
- Default radius: `4px` for controls and badges, `6px` for tables/panels, `8px` only for larger soft containers where already established
- Content padding: `24px` (`--shell-page-gutter`, `--container-padding`)
- Table row target: `40px` compact, `48px` normal
- Section gap: `16px`

Spacing tokens used in runtime/showcases: `4, 8, 12, 16, 20, 24, 32, 48` px.

Rules:

- Favor even, repeatable spacing over tight packing
- Do not shrink controls below shared primitive sizes to “fit more”
- Use density in tables, not by making labels microscopic

## Shell

The shell behaves like a modern enterprise console:

- Top bar: surface, subtle bottom border, search input + meta on right
- Sidebar: surface (theme-following), grouped nav with uppercase section labels, active row uses both a left rail marker and a quiet primary-tinted background fill
- Content: warm light canvas with white surfaces inside

Rules:

- Light content theme is default
- Search input stays visible in the top bar (uses sunken surface inside the bar)
- Nav hover changes background only; no horizontal/vertical movement
- Active nav uses a quiet selected fill plus a `3px` left primary accent
- Inactive nav text uses `text-foreground/75`, not the weaker tertiary tone

## Tables

Tables are the main product surface. SAP/Fiori discipline, not generic SaaS cards.

Rules:

- Sticky headers
- Header background uses sunken surface; header text is uppercase, 12px, semibold, secondary color
- Strong row separation via `1px` borders
- Hover fill uses sunken/primary-tint tokens; clickable rows may add an inset `3px` primary rail
- Body text stays at base UI size
- Numeric columns right-aligned
- Reference values use mono treatment (`role-reference-*` / `role-material-code`)
- Selection and expand controls stay compact but obvious
- Default density is compact (`40px` rows, `36px` header); normal density is available for more spacious views

Do not:

- bury tabular data inside decorative cards
- use soft low-contrast headers
- animate rows laterally on hover

## StatCards (KPI panel)

Most list and dashboard pages need four key numbers. Render them as a single `StatCardRow` panel of `StatCard` cells, each with a colored left accent rail for its metric type.

Rules:

- Use `StatCardRow` for the full panel
- Use `StatCard` only as a metric cell inside that panel
- Each card carries a `3px` vertical left accent rail in its metric color (blue / green / amber / red / neutral)
- `StatCardRow` is one divided, bordered, shadowed panel rather than independent floating cards
- Icons sit in quiet tinted square wells
- Label uses `role-field-label`; value uses `role-kpi-lg` (`24px`, mono, semibold); sub-line uses `role-metadata`
- Active/clickable metrics change background and may use `--shadow-card-hover`; no hover translation
- Do not create page-local KPI card grids

## Forms

Forms must be easy for one older operator to complete without second-guessing.

Rules:

- Labels always visible above inputs
- Clear focus ring: a 2px `--focus-ring` outline on keyboard focus; the input border becomes focus blue
- Read-only values look deliberate, not disabled by accident
- Error copy is inline and direct
- Placeholder text cannot carry critical meaning
- Default input height: `32px`, large height `36px`, radius `4px`, `1px` border for default inputs
- Filled inputs use sunken background and a transparent `2px` border until focused

Use:

- `Input`, `Textarea`, `Select`, `Checkbox` from shared primitives
- helper text for context
- warning color only for actual warnings

## Buttons

Buttons should feel stable, not floaty.

| Variant     | Use                           | Visual                                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Primary     | save, create, submit, confirm | primary fill, primary contrast text, transparent border, subtle primary shadow |
| Secondary   | alternate path                | surface fill, neutral border, foreground text                                  |
| Outline     | low-emphasis bordered action  | transparent fill, neutral border, foreground text                              |
| Ghost       | low-emphasis local action     | transparent, hover fills with hover-surface, foreground text                   |
| Destructive | irreversible action only      | solid error fill, error contrast text                                          |

Sizing: `32px` for `sm`/`md`, `36px` for `lg`; `4px` radius for `sm`/`md`, `6px` for `lg`; labels use role text classes.

Do not:

- translate buttons on hover
- active press feedback may use a one-pixel downward translation
- invent page-local button variants
- mix too many equal-weight actions in one row

## Dark mode policy

Dark mode is supported. It is no longer a visual showcase.

Rules:

- solid surfaces, not frosted panels
- readable contrast, not low-contrast fashion tones
- same hierarchy as light mode
- subtle white radial/linear depth layers are allowed on the body and app shell only, as currently defined in `globals.css`
- component surfaces remain token-driven (`--surface`, `--surface-elevated`, `--surface-sunken`)
- no blue-tinted page background

## Writing style

Copy should sound operational:

- "Failed to load purchase orders"
- "Reset local credentials"
- "System online"

Avoid:

- hype language
- vague dashboard slogans
- decorative helper copy

## Implementation rules

1. Keep theme tokens in `apps/web/src/styles/globals.css`; change them only through an ADR
2. Keep shell behavior in shared common components
3. Update shared primitives before module overrides
4. If design intent is global, remove duplication from touched modules
5. Match docs to actual code, fonts, and tokens
6. `globals.css` and the shared components (`apps/web/src/components/common`) are the runtime source of truth; this file stays in sync with them.

## Immediate baseline (v2)

This version standardizes on:

- warm stone palette (off-white content, warm-light shell)
- Bricolage Grotesque for display, Public Sans for UI/body, JetBrains Mono for numerics/IDs
- compact shared controls (`32px` default, `36px` large)
- `6px` panels/tables, `4px` controls and chips, `8px` only for larger established containers
- left-accent StatCards inside one divided panel
- stronger uppercase table headers
- cleaner shell with visible search
- no glass-first design language for runtime ERP surfaces

## References

This direction is informed by official Google Material guidance on layout, responsive structure, accessibility, and meaningful motion:

- https://m1.material.io/layout/principles.html
- https://m1.material.io/layout/responsive-ui.html
- https://m1.material.io/usability/accessibility.html
- https://m1.material.io/motion/material-motion.html
