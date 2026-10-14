# SPEC-16 — Web: PO and SRV screens, uploads and folder import

Layer: L5. Architecture refs: §6.2, §6.8, §6.9 (display), §6.11, §7.3 (progress polling), §7.4, §12.2, §12.3,
§14.1 (e2e), C7, C8; spec §1, §3, §4; A-6, A-9, A-13, A-15, A-23.

## 1. Summary

The PO and SRV screens as the legacy app shows them, now leading with quantity columns (A-9), showing flags as
badges in a reserved column and highlighted rows, the inline item-level manual dispatched quantity (A-15) in the
place where the legacy lot override was edited, uploads of PO/SRV HTML, and folder import with job progress. No new
screens; the folder-import controls live where the legacy sync/upload controls were.

## 2. Scope

Core:
- `/po`: DataTable with the legacy columns, quantity columns first (Pending, Dispatched, Received, Accepted,
  Rejected; INV-65), status badge and filter, flag badge column, linked DC/SRV/invoice counts with popovers
  (INV-73), supply progress ring = max(dispatched, accepted) progress (spec §3, INV-73), URL-synced paging/sort/
  filters, upload PO HTML (per-file results).
- `/po/:id`: header info, items with quantities and status (Cancelled shown for amended-out items; INV-63), lots
  with the entry-allow note shown in place of a date (INV-46), highlighted flagged rows and the
  `MANUAL_ADJUSTMENT_OVERLAP` highlight (INV-57), inline manual dispatched qty + note editor (INV-08), linked
  documents tabs, delete button disabled with a plain reason when blocked (INV-35).
- `/po/create`: the legacy manual PO form (create and edit); GEMC items take the GST-inclusive rate (INV-20).
- `/srv`: legacy list and by-PO views, "PO not found" label (INV-40), upload SRV HTML; `/srv/:id`: items, raw
  challan/invoice numbers with links when resolved, flags; delete (never blocked).
- Folder import: pick a PO folder, then an SRV folder (platform picker), staged upload, job start, `JobProgress`
  panel polling every 2 s (`total, done, skipped, failed, current`), cancel, and the job summary with skipped and
  failed files and reasons and flags by type (§7.4). `JobProgress` is a shared component reused by SPEC-19.

Out of scope:
- BHEL sync wizard on `/po/ingest-bhel` (SPEC-19); DC/invoice screens (SPEC-18); deviations screen (SPEC-17).

## 3. Dependencies

- SPEC-14, SPEC-10 (PO/SRV/flags APIs), SPEC-08 (uploads, jobs, staging).

## 4. Design

### 4.1 Modules (`apps/web/src/`)

`routes/po/{index,$id,create}.tsx`, `routes/srv/{index,$id}.tsx`;
`components/modules/po/{POList,PODetail,PODetailItems,ManualQtyCell,LinkedDocsPopover,POForm}.tsx`,
`components/modules/srv/{SRVList,SRVDetail}.tsx`, `components/common/{JobProgress,FolderImport}.tsx`.

### 4.2 Error handling

Per-file upload results listed in the upload modal (accepted / skipped as older / failed with reason); job failures
shown in the summary; blocked delete shows the server's plain reason; all inside fixed footprints (C8).

## 5. Invariants

INV-08, INV-20, INV-35, INV-40, INV-46, INV-57, INV-60, INV-63, INV-65, INV-70, INV-71, INV-73.

## 6. Testing strategy

E2E on a synthetic dataset (§14.1): PO paging with equal pager/header bounding boxes across pages, sorts and page
sizes; filters and status toggles keep the toolbar in place; folder import of the synthetic fixture folders with a
visible summary; manual qty edit changes Dispatched and Pending and writes the value back after reload; a blocked
delete shows its reason; GEMC create shows the stored net. Unit tests for cell renderers (entry-allow note,
cancelled marker).

## 7. Acceptance criteria

- [ ] Lists lead with quantity columns; status is a badge and a filter.
- [ ] No interaction on these screens moves or resizes surrounding layout: fixed table layout and widths, reserved
      page height with padded rows, a fixed pager, same-footprint loading/empty/error states, popovers and inline
      editors that do not reflow rows.
- [ ] Folder import works in the desktop shell and in a plain browser.
- [ ] Light/dark screenshots match legacy (review artefacts).
- [ ] `pnpm verify` and every CI job green, including `e2e`.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | PO list | `routes/po/index.tsx`, `POList`, `LinkedDocsPopover`, upload modal wiring, e2e | `check`, `e2e` | Paging/sort/filter no-shift e2e passes; counts and popovers show live linked documents. |
| 2 | PO detail and manual dispatched qty | `routes/po/$id.tsx`, `PODetail`, `PODetailItems`, `ManualQtyCell`, e2e | `check`, `e2e` | Quantities, lots (entry-allow note), cancelled items, flag highlights and overlap highlight render; manual qty round-trips; delete disabled with reason. |
| 3 | PO create and edit | `routes/po/create.tsx`, `POForm`, e2e | `check`, `e2e` | Manual PO created and edited; GEMC inclusive rate stored with derived net (INV-20). |
| 4 | SRV list and detail | `routes/srv/*`, `SRVList`, `SRVDetail`, e2e | `check`, `e2e` | Flat and by-PO views; "PO not found"; resolved links clickable; delete works. |
| 5 | Folder import and job progress | `FolderImport`, `JobProgress`, placement on the legacy sync/upload controls, e2e | `check`, `e2e` | Synthetic PO then SRV folders import with progress, cancel and summary; panel keeps its footprint while polling. |

## 9. Open issues

- Placement of the folder-import controls is the legacy "sync folder" location (A-6 replaced its mechanism, not its
  place); implementation detail read from the legacy UI.
