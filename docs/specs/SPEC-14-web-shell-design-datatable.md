# SPEC-14 — Web shell, frozen design system, DataTable and platform adapter

Layer: L5. Architecture refs: §12.1–§12.4, §14.1 (e2e), §14.2 (`e2e` job), C7, C8, C16; A-2, A-18, A-23.

## 1. Summary

The `apps/web` foundation every screen spec builds on: a Vite+ (`vp dev` / `vp build`) React SPA with TanStack
Router (file routes, Zod `validateSearch`) and TanStack Query, the frozen design carried over (`globals.css`
verbatim, self-hosted fonts, the shell, and shadcn/ui primitives restyled to the tokens), one shared-component registry, the DataTable that
implements the no-layout-shift rule (C8, A-23) on TanStack Table, the `Platform` adapter, the design validators, the bundle budget and
the Playwright e2e harness with its Windows CI job. Flows and on-screen elements are frozen (A-2, D-0016): components
keep the legacy elements, labels and behaviour (C16); minor visual differences are allowed where they reduce
maintenance, improve performance or increase consistency.

## 2. Scope

Core:

- App skeleton: router with every frozen route (`/`, `/po`, `/po/:id`, `/po/create`, `/po/ingest-bhel`, `/dc`,
  `/dc/:id`, `/dc/create`, `/invoice`, `/invoice/:id`, `/invoice/create`, `/srv`, `/srv/:id`, `/delivery-tracker`,
  `/reports`, `/deviations`, `/system/ledger`, `/settings`, `/auth/login`) plus `/onboarding`, without
  `/procurement` (INV-67); Query keys `[resource, params]`, `placeholderData: keepPreviousData`, one invalidation
  per mutation; no global page stores; route-level code splitting; typed client from `packages/schemas`.
- Design carry-over (INV-66): `src/styles/globals.css` copied verbatim (§12.2 names this one exception to C16);
  the enumerated token fixes in one ADR (`docs/adr/0004-globals-css-token-fixes.md`): dark badge text tokens,
  referenced-but-undefined tokens, tertiary/placeholder contrast to 4.5:1, one focus-ring token, light warning
  contrast, dead blocks. Fonts via `@fontsource` (Public Sans, Bricolage Grotesque, JetBrains Mono) with the same
  CSS variables and the weights `role-*` uses; their licences in `NOTICE`. `docs/DESIGN.md`: the legacy design
  document, de-branded.
- Design validators (moved here from SPEC-00): `tools/checks/validate-{colors,typography,imports,icons,components}.ts`,
  rebuilt from the legacy validators' rules, in `check`; token-parity Vitest test (every `:root` colour token has a
  `.dark` value).
- Registry `src/components/common/index.ts` (deep imports and local copies fail `validate-imports`).
- Shell: app chrome, sidebar (labels and groups as legacy, without the sourcing entry), page header, stat cards,
  detail tabs, list toolbar, theme toggle, toast, global-search dialog shell.
- Primitives, generated with the shadcn CLI into `components/ui/` (owned MIT source; runtime dependencies Radix UI,
  cva, clsx, tailwind-merge), restyled to the `globals.css` tokens and exported through the registry (D-0015): Button, Input, Textarea, Select, Checkbox, Calendar/DatePicker, Dialog, confirmation modal, Popover,
  Badge/StatusBadge, QuantityInput, Autocomplete, FileUploadModal, `FormField` (label, help and error associated;
  icon-only buttons need `aria-label`).
- DataTable and Pagination (INV-70, INV-71), custom on TanStack Table: `table-layout: fixed` with a required width per column; single-line
  truncated cells with `title`; body height reserved as `pageSize × rowHeight` with `aria-hidden` filler rows;
  loading/empty/error rendered inside the reserved body with header and pager mounted; pager always mounted with page
  and range text in fixed-width `tabular-nums` slots; sort via a `<button>` in `<th>` with `aria-sort`; flag badge
  column with reserved width; highlighted rows. Toolbar count pills, Clear/Reset and badges keep their slot
  (`invisible`, never unmounted). `useListSearch` binds page/size/sort/filters to the URL.
- `Platform` adapter (§12.4): `src/platform/{index,tauri,web}.ts` chosen at runtime — folder/file pickers, Save-as,
  notifications, tray status; the web variant uses browser downloads and `<input webkitdirectory>`.
- Bundle budget: shell ≤ 250 kB gzip checked in CI (INV-104).
- Playwright e2e harness and the `e2e` CI job (Windows): starts the API on a temp data dir with a synthetic dataset
  and the built SPA; `expectNoLayoutShift(page, locators, action)` helper comparing bounding boxes; Playwright
  component tests for DataTable.

Out of scope:

- Screens (SPEC-15..18, SPEC-19 PR 5); new screens other than `/onboarding` (A-2).
- Adding or removing on-screen elements, changing flows, or a new token without an ADR (C7, D-0016).

## 3. Dependencies

- SPEC-04 (route table, client, formatters), SPEC-07 (session, health) for the running app.
- Decisions: A-2, A-16, A-18, A-23, D-0015, D-0016.

## 4. Design

### 4.1 Modules (`apps/web/src/`)

`main.tsx`, `router.tsx`, `routes/**` (file routes), `lib/{api,query}.ts`, `styles/globals.css`,
`components/ui/*` (generated shadcn/ui primitives), `components/common/*` (registry), `components/modules/*` (per-screen, filled by later specs), `platform/*`,
`hooks/useListSearch.ts`. `e2e/` with Playwright config, fixtures and helpers; `apps/web/ct/` for component tests.

### 4.2 DataTable contract

```ts
type Column<Row> = {
  key: string;
  header: string;
  width: string /* required */;
  align?: "left" | "right";
  sortable?: boolean;
  render?: (row: Row) => ReactNode;
  title?: (row: Row) => string;
};
type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  total: number;
  page: number;
  pageSize: number;
  sort?: { key: string; dir: "asc" | "desc" };
  state: "loading" | "ready" | "error";
  error?: string;
  emptyText: string;
  onPage(p: number): void;
  onPageSize(n: number): void;
  onSort(key: string): void;
  rowHighlight?: (row: Row) => boolean;
};
```

### 4.3 Error handling

API errors surface as the legacy toast/inline message styles with the server's plain `message`; 401 redirects to
`/auth/login`; `onboarding-required` redirects to `/onboarding`.

## 5. Invariants

INV-66, INV-67, INV-70, INV-71, INV-104 (new).

## 6. Testing strategy

Vitest + Testing Library for primitives (labels, `aria-sort`, `aria-label`); token parity; validator pass/fail
fixtures; Playwright component tests: DataTable header, body and pager bounding boxes equal across page 1, a short
last page, loading, empty and error; sort and page-size changes keep the boxes. Light and dark screenshots of each
touched shared component are review artefacts.

## 7. Acceptance criteria

- [ ] Every frozen route is registered; `/procurement` is absent; `/onboarding` exists.
- [ ] `globals.css` equals the legacy file except the ADR's listed fixes; every `:root` colour token has a `.dark`
      value.
- [ ] **No layout shift:** clicking pagination (prev/next/page size), tabs, filters, toggles, expanders or sort
      moves or resizes nothing around the control; the DataTable keeps fixed column widths and a reserved full-page
      body with padded short pages; the pager stays in place on every page; loading, empty and error states take
      the same footprint (Playwright bounding-box tests).
- [ ] Every flow works in a plain browser through `platform/web.ts`.
- [ ] Shell bundle ≤ 250 kB gzip; `e2e` job green on Windows; `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                 | Scope / files                                                                                                                                                                       | Checks                    | Done when                                                                                                                                                          |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | App skeleton, router and query        | `apps/web/{index.html,vite.config.ts}`, `src/{main,router}.tsx`, `src/routes/**` placeholders, `src/lib/{api,query}.ts`, `tools/checks/src/bundle-budget.ts`, tests                 | `check`, `build`          | `vp build` produces the SPA; all frozen routes plus `/onboarding` resolve; route test asserts no `/procurement`; budget check passes.                              |
| 2   | Frozen design carry-over              | `src/styles/globals.css`, `@fontsource` setup, `docs/adr/0004-globals-css-token-fixes.md`, token-parity test, `docs/DESIGN.md`, `NOTICE` font entries                               | `check`, `real-data-scan` | Diff vs legacy `globals.css` equals the ADR list; parity test passes; DESIGN.md de-branded.                                                                        |
| 3   | Design validators                     | `tools/checks/validate-*.ts`, fixtures, wiring in `check`                                                                                                                           | `check`                   | Each validator fails its failing fixture and passes the repo.                                                                                                      |
| 4   | Shell components                      | `components/common/{AppChrome,SidebarNav,PageHeader,StatCard,DetailTabs,ListToolbar,ThemeToggle,Toast,GlobalSearchDialog}.tsx`, registry, tests                                     | `check`                   | Shell renders in light and dark with the legacy screenshots' elements and labels; sidebar labels frozen; no sourcing entry.                                        |
| 5   | Primitives and FormField              | `components/ui/*` generated with the shadcn CLI and restyled to tokens (instead of porting legacy primitives), `components.json`, registry exports, `NOTICE` shadcn/ui entry, tests | `check`, `licenses`       | Labels/help/errors associated; icon-only buttons named; `validate-components` passes.                                                                              |
| 6   | DataTable, Pagination and list search | `components/common/{DataTable,Pagination}.tsx`, `hooks/useListSearch.ts`, Vitest tests                                                                                              | `check`                   | Filler rows, in-body states, mounted pager, fixed slots, `aria-sort` covered by unit tests.                                                                        |
| 7   | Platform adapter                      | `src/platform/{index,tauri,web}.ts`, tests                                                                                                                                          | `check`                   | Web variant downloads via blob and picks folders via `webkitdirectory`; Tauri variant compiles against plugin APIs and is selected only inside the shell.          |
| 8   | Playwright harness and `e2e` job      | `apps/web/e2e/*`, `apps/web/ct/*`, `expectNoLayoutShift` helper, `ci.yml` `e2e` (windows)                                                                                           | `e2e`                     | DataTable component tests prove equal bounding boxes across pages, sorts, page sizes and loading/empty/error; the `e2e` job is green and added to required checks. |

## 9. Open issues

- `globals.css` verbatim copy is the architecture's explicit exception to C16 (§12.2).
- Legacy screenshots used as visual references are taken from the legacy app with synthetic data only (C1).
- The tray "status" API in the web variant is a no-op; implementation detail.
