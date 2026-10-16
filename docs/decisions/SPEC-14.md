# SPEC-14 decisions

Decisions for [SPEC-14 — Web shell, frozen design system, DataTable and platform adapter](../specs/SPEC-14-web-shell-design-datatable.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0015 — UI primitives from shadcn/ui

- Date: 2026-10-14 · Spec/PR: SPEC-14 PR 5 · Status: decided-owner
- Decision: UI primitives are shadcn/ui components generated with the shadcn CLI into `apps/web/src/components/ui/` (owned MIT source, not a package) and restyled to the `globals.css` tokens; runtime dependencies are Radix UI, cva, clsx and tailwind-merge. The DataTable stays custom on TanStack Table with the C8 fixed-layout, no-shift pager rules.
- Alternatives: Port the legacy primitives (SPEC-14 PR 5 as first written); the shadcn data-table.
- Why: Accessible, maintained primitives with less owned code to write. ARCHITECTURE §12.3 and §16 (rev 1.2) and SPEC-14 §1, §2, §4.1 and PR 5 updated.
- Reversible: costly — every primitive would be rewritten.
- Owner answer: Owner decision, 2026-10-14.

### D-0360 — Vite+ core stands in for vite

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: `pnpm-workspace.yaml` overrides `vite` with `@voidzero-dev/vite-plus-core`, so the React, Tailwind and router plugins run on Vite+'s Vite.
- Alternatives: A second Vite install beside Vite+.
- Why: One Vite instance; the plugin types match.
- Reversible: yes — drop the override.

### D-0361 — The route tree is generated and checked in

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: `apps/web/src/routeTree.generated.ts` is committed; `pnpm gen:routes` rebuilds it and a test in `tools/gen` fails when it is stale.
- Alternatives: Generate it only during the build, which leaves `tsc -b` blind on a clean checkout.
- Why: Type checks and tests run without a build first.
- Reversible: yes.

### D-0362 — Query client defaults and redirects

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: An `ApiError` is never retried and a network error is retried up to three times. `keepPreviousData` holds the last page while the next loads (C8). Query keys are `[name, args ?? {}]`, and only `GET` routes can be queries (`ReadRouteName`). A 401 goes to `/auth/login` and `onboarding-required` goes to `/onboarding`, both from the cache `onError`.
- Alternatives: Per-screen error handling.
- Why: The API's answer does not change on a retry; one place for the redirects.
- Reversible: yes.

### D-0363 — `ApiError` on its own subpath

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: `@senstosales/schemas/errors` exports `ApiError` without zod; the web shell imports it from there.
- Alternatives: The package barrel.
- Why: The barrel pulled zod into the shell (+32 kB gzip, measured).
- Reversible: yes.

### D-0364 — What the bundle budget counts

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: The INV-104 budget counts the scripts and stylesheets the built `index.html` names (entry, modulepreloads, styles), gzipped. It does not count route chunks loaded on navigation or fonts. It reads only `apps/web/dist`.
- Alternatives: All of `dist`.
- Why: INV-104 names the shell, which is what the first load fetches.
- Reversible: yes.

### D-0365 — Self-hosted variable fonts

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: `@fontsource-variable` Public Sans, Bricolage Grotesque and JetBrains Mono (OFL-1.1, in `NOTICE`) replace `next/font`. `:root` defines the three font variables `@theme` reads.
- Alternatives: Static weights.
- Why: One file per family covers every weight the roles use.
- Reversible: yes.

### D-0366 — Reading of ADR 0004

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: "Referenced but undefined" means the `var(--…)` uses inside `globals.css`, which are the font variables. Legacy utility names with no token get a mapping table in the ADR, not aliases. The one exception is `--color-placeholder` (item 7), which inputs need.
- Alternatives: Alias every legacy name to a token.
- Why: Aliases would keep names that never rendered a colour and add tokens without a use.
- Reversible: yes — a new ADR.

### D-0367 — Validator scope and rules

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: The design validators scan git-tracked `.ts`/`.tsx` files under `apps/web/src`, excluding generated files. They use the real-data scan's file list.
  - The legacy icon rules are reduced to one rule: import only through `src/lib/icons.ts`.
  - New beyond legacy: C7's important-utility rule, `dark:` colours, undefined tokens and colours, and `role-*` overrides.
- Alternatives: Walk the file system; port every legacy rule.
- Why: Tracked files are what CI sees. The new rules enforce C7 as written.
- Reversible: yes.

### D-0368 — Token-parity test lives in tools/checks

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: `tools/checks/test/token-parity.test.ts`, next to the `globals.css` reader it shares with the validators.
- Alternatives: `apps/web/test`.
- Why: One CSS reader.
- Reversible: yes.

### D-0369 — Shell components before the primitives

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: Row 4 builds on raw elements and Radix Dialog; row 5 adds the `components/ui` primitives. The theme is `lib/theme.ts` (localStorage `theme`, `.dark` on `<html>`), without next-themes. The registry exports only what screens use.
- Alternatives: Build the primitives first.
- Why: The spec orders the rows this way; the shell needs no form controls.
- Reversible: yes.

### D-0370 — The search dialog is a frame until SPEC-15

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: `GlobalSearchDialog` renders the frozen frame: input, filter and saved toggles, the "Type to search" pane and the footer. It loads on first open (Ctrl/⌘+K or click). SPEC-15 adds results, preview, filters and saved searches.
- Alternatives: Slots for the SPEC-15 content now.
- Why: No speculative options; the lazy chunk keeps Radix Dialog out of the shell.
- Reversible: yes.

### D-0371 — Badges and the active rail keep their slot

- Date: 2026-10-15 · Spec/PR: SPEC-14 PR 1-4 (#78) · Status: decided
- Decision: A `DetailTabs` badge at 0 and the sidebar's inactive rail are `invisible`, not removed.
- Alternatives: Render nothing.
- Why: C8; tabs and nav items keep their size when counts or the route change.
- Reversible: yes.

### D-0405 — shadcn primitives through the CLI, restyled to tokens

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: `components/ui/*` are generated with the shadcn CLI on the `radix-ui` umbrella package and `class-variance-authority`, then every colour is replaced by a `globals.css` token or role class.
- Alternatives: Port the legacy primitives; per-component `@radix-ui/*` packages.
- Why: ARCHITECTURE §12.3 and D-0015; one Radix package keeps the primitives on one version.
- Reversible: yes.

### D-0406 — DataTable body rows are a fixed 40 px

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: Every body row (data, filler, loading/empty/error) is 40 px with a 1 px bottom border (transparent on filler and state rows), so a page's body is `pageSize × 40` whatever it holds.
- Alternatives: Measure the first row at runtime.
- Why: C8/INV-71 need the footprint before data arrives; the CT bounding-box tests found a 0.5 px pager shift when filler rows had no border.
- Reversible: yes.

### D-0407 — Rows stay on screen while the next page loads

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: While `loading`, rows already shown stay (dimmed, `aria-busy`); the in-body "Loading..." shows only when there are none.
- Alternatives: Always replace the rows with the loading state.
- Why: Matches keepPreviousData and avoids a flash; the footprint is the same either way (C8).
- Reversible: yes.

### D-0408 — List paging in the URL keeps the first row on a page-size change

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: `useListSearch` replaces the history entry on every change; a page-size change goes to `floor((page-1)·from/to)+1`; a sort or filter change goes to page 1; a new sort column starts ascending. The page size is per list URL (EC-58).
- Alternatives: Always reset to page 1; remember one global page size as legacy did.
- Why: Legacy table behaviour (visible behaviour only, C16); SPEC-14 §2 binds paging to the URL.
- Reversible: yes.

### D-0409 — Tauri saves through the webview's Save-as picker

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: `tauri.ts` saves with `showSaveFilePicker` (a cancel is `"cancelled"`, any other failure falls back to a blob download); files never cross IPC. The web build never asks for notification permission and notifies only when already granted.
- Alternatives: `@tauri-apps/plugin-dialog` plus an fs write.
- Why: No fs capability needed (C12, SPEC-20's capability set); no prompt in a plain browser (C11).
- Reversible: yes.

### D-0410 — Component tests on a Vite-built static page

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: `apps/web/ct/` builds a story page; the specs serve `ct/dist` from disk through `page.route`, with no server process.
- Alternatives: `@playwright/experimental-ct-react`.
- Why: It stops at Playwright 1.62 and would pull in a second Playwright.
- Reversible: yes.

### D-0411 — Playwright on system Edge, headless, one worker

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: Playwright runs on the `msedge` channel, headless, one worker, list reporter, traces off; no report server.
- Alternatives: Download the bundled Chromium.
- Why: Every Windows machine and the `windows-2025` runner have Edge; owner rule that nothing opens a window.
- Reversible: yes.

### D-0412 — `sideEffects` allowlist in apps/web

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: `apps/web/package.json` declares `"sideEffects": ["*.css", "./src/main.tsx"]`; a future module with import-time effects must be added to it.
- Alternatives: Deep imports instead of the registry barrel.
- Why: Keeps the INV-104 budget (shell 180 → 163.7 kB gzip) while screens import from one registry (C7).
- Reversible: yes.

### D-0413 — Typed date input formats

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: `parseDateInput` accepts the legacy typed formats from a table, trying day-first before month-first for numeric dates.
- Alternatives: ISO input only.
- Why: Frozen legacy input behaviour (C7); day-first matches Indian dates.
- Reversible: yes.

### D-0595 — DataTable body is a fixed ten-row window

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: The body reserves ten rows (the smallest page size) under a sticky header; larger pages scroll inside it, so a page-size change resizes nothing. One `auto` column per table takes the leftover width.
- Alternatives: Reserve the chosen page size's height (moves the pager on a size change).
- Why: C8: the pager moved when the page size changed (UI-SHIFT); owner-approved rev 1.10.
- Reversible: yes.

### D-0596 — Sort arrow in the header padding

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: The sort arrow is positioned absolutely beside the header text, in the cell padding.
- Alternatives: Widen every sortable column for the arrow.
- Why: Headers were cut under the arrow at 1366 (UI-TRUNC) without widening tables.
- Reversible: yes.

### D-0597 — PO list keeps a sideways scroll at 1366

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: The PO list keeps its 14 frozen columns at measured widths and scrolls sideways at 1366 (needs about 1277 px against about 1090 px); nothing is truncated.
- Alternatives: Drop or merge columns.
- Why: C7 freezes the columns; truncating numbers would hide data.
- Reversible: yes.

### D-0598 — Deviations Type width

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: The Type column fits every v1 flag name except MANUAL ADJUSTMENT OVERLAP, which is cut with the full name in its title.
- Alternatives: Size for the longest name.
- Why: One rare name would cost every row about 60 px.
- Reversible: yes.

### D-0599 — Date placeholder

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: An empty date field shows `Mon DD, YYYY`.
- Alternatives: A sample date.
- Why: A real-looking placeholder read as a filled value (UI-MISC).
- Reversible: yes.

### D-0604 — Create-page error in the header

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: A create page's error sits in a fixed slot in the page header beside Save (`HeaderAlert`), invisible until set.
- Alternatives: A reserved band above the form.
- Why: The band left a blank strip on every create page (UI-MISC); the slot moves nothing (C8).
- Reversible: yes.

### D-0605 — Form dialogs sized to the window

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: `FormDialog` is capped at the window height and its fields scroll; the dialog's buttons stay visible.
- Alternatives: A per-dialog max height.
- Why: The invoice edit dialog was cut off on a short window (UI-MISC).
- Reversible: yes.

### D-0607 — Mark queries stale before leaving a create page

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: DC and invoice create mark their queries stale without refetching (`useMarkStale`), then navigate; the next page fetches each once.
- Alternatives: Invalidate after navigating.
- Why: Refetching the left page's invoice preview of a now-invoiced DC gave a 409; invalidating after navigating fetched the new page twice.
- Reversible: yes.

### D-0627 — Invoice line widths

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: S.N. 48, HSN 104, Unit 60, Qty 104, Rate 120, Taxable and Total 140, CGST and SGST 132 px; Material is the `auto` column. Amount cells carry their value as the title.
- Alternatives: Material at 260 px (the amounts were cut at 1366).
- Why: Measured text at 1366: GEMC line amounts up to ₹99,999.12345 fit (N-INV-DETAIL).
- Reversible: yes.

### D-0628 — Deviations keeps measured widths and scrolls at 1366

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: Issue is the `auto` column with `minWidth` 176 (new `Column.minWidth`, the floor of an `auto` column); Status 100, Detected 200, Document 120, Expected 88, Actual 80 px. Together they pass 1366, so the table scrolls sideways there, as legacy did and as the PO list does (D-0597).
- Alternatives: Fit 1366 by cutting Issue (the finding), Type or Detected.
- Why: No arrangement fits every column's content at 1366; the issue is the column the user reads (N-UI).
- Reversible: yes.

### D-0630 — Tracker widths

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: Lot 60, Unit Price 124, Pending Value 124, Days Overdue 128 px; PO / Material is `auto` with `minWidth` 112, its header's width.
- Alternatives: A sideways scroll.
- Why: The header was cut at 1366; the material text truncates with its title by design (N-UI).
- Reversible: yes.

### D-0631 — UI-SHIFT: ARCHITECTURE §12.3 governs

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: No DataTable change: the body stays the ten-row window of §12.3 (rev 1.10). The finding measured the inner `<table>` inside the fixed scroll box; measured on the scroll box, 0 interactions shift anything.
- Alternatives: Reserve the largest page's height (contradicts §12.3; about 3,600 px of blank rows under a 10-row page).
- Why: Agreed with the orchestrator, 2026-10-16.
- Reversible: yes.
