# SPEC-09 — Corpus import and report (local only)

Layer: L4. Architecture refs: §7.4, §14.1, C1, INV-76; A-6.

## 1. Summary

A developer tool that imports the owner's full PO and SRV HTML corpus through the real ingestion services and jobs
into a throwaway database, and writes an import report. It proves the L4 exit ("a full local corpus imports through
jobs") and gives the owner a review document before cutover. Import is ingestion of documents only: there is no
legacy-database input, no cross-validation against a legacy database and no DB-only fallback (A-6; owner
decision of 2026-10-14). It runs only where `SENSTO_CORPUS_DIR` is set and never in CI (INV-76).

## 2. Scope

Core:
- `pnpm import:corpus`: creates a temporary data dir outside the repo, migrates an empty DB, runs onboarding with a
  synthetic profile, enqueues `po.import-folder` then `srv.import-folder` over the corpus files (via the same
  staging path as the UI), waits for completion, then writes the report.
- Report `import-report.md` and `import-report.json` to `SENSTO_REPORT_DIR` (default: the OS temp dir; never inside
  the repo), built from the two job summaries plus totals: files accepted / skipped (older) / failed with reasons,
  flags by type, POs by status, SRVs with "PO not found".
- Idempotency check: running the import twice into the same DB leaves every derived quantity and every flag
  unchanged (second run: same-date upserts and no new flags).
- `pnpm test:corpus` gains the ingestion assertions: every file ingests or fails with a typed reason; no unexpected
  exception; idempotency holds.

Out of scope:
- Reading the legacy DB (A-6, INV-49); carrying legacy DCs/invoices (live data has none; owner decision).
- The cutover itself (SPEC-22).

## 3. Dependencies

- SPEC-08 (jobs, ingestion, folder import staging), SPEC-07 (onboarding service).
- Human task H4 (corpus on the build machine).

## 4. Design

### 4.1 Modules

| Path | Responsibility |
|---|---|
| `tools/corpus/import.ts` | the runner (uses `createServices` with node platform adapters on a temp data dir) |
| `tools/corpus/report.ts` | `buildReport(jobSummaries, db): ImportReport`; markdown and JSON renderers |
| `tools/corpus/ingest.corpus.test.ts` | local assertions, skipped without `SENSTO_CORPUS_DIR` |
| `tools/corpus/report.test.ts` | CI test of `buildReport` on a synthetic fixture folder |

### 4.2 Privacy

The report contains real identifiers and counts, so it is written only outside the repo and is never pasted into a
PR, issue or log (C1). Console output is pass/fail plus the report path.

## 5. Invariants

INV-49, INV-76.

## 6. Testing strategy

CI: `report.test.ts` runs the runner over the anonymised parser fixtures copied to a temp dir and asserts the
literal report content. Local: the corpus test with the owner's corpus.

## 7. Acceptance criteria

- [ ] On the owner's machine, the full corpus imports through jobs with no unexpected exception (L4 exit).
- [ ] The report lists accepted, skipped and failed files with reasons and flags by type.
- [ ] A second import changes no derived quantity and adds no flag.
- [ ] Nothing is written inside the repo; CI never runs the corpus steps.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | Corpus import runner | `tools/corpus/import.ts`, `pnpm import:corpus` script, test over fixtures in a temp dir | `check` | The runner imports the fixture folder through jobs into a temp data dir and exits 0. |
| 2 | Import report | `tools/corpus/report.ts`, `report.test.ts` | `check` | The synthetic report matches literal expected markdown and JSON. |
| 3 | Corpus ingestion assertions and idempotency | `tools/corpus/ingest.corpus.test.ts` | local | On the owner's machine the full corpus imports; a second run changes nothing; skipped without the env var. |

## 9. Open issues

- None beyond SPEC-08's folder-import transport.
