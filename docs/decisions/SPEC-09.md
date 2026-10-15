# SPEC-09 decisions

Decisions for [SPEC-09 — Corpus import and report (local only)](../specs/SPEC-09-corpus-import-report.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0232 — Corpus folder layout

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 1 (#54) · Status: decided
- Decision: `SENSTO_CORPUS_DIR` holds a `po/` and an `srv/` folder; the runner takes the `*.html`/`*.htm` files under each, subfolders included, in path order, named by their path inside the folder. A folder with no pages refuses the run before a database is made.
- Alternatives: One mixed folder, with each page's kind detected by trying both parsers.
- Why: The UI picks one folder per kind (ARCHITECTURE §7.4), and the parser fixtures already use `po/` and `srv/`. Detecting the kind would be invented behaviour.
- Reversible: yes.

### D-0233 — The corpus runner calls the services in process

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 1 (#54) · Status: decided
- Decision: `importCorpus` calls `folderImport.stage`, `jobs.start` and `jobs.detail` on the services from `openRuntime` and waits on the job runner's `idle()`, not over HTTP. Staging requests are split with `splitUpload`, as the web client splits them.
- Alternatives: Start the server and drive the HTTP API.
- Why: SPEC-09 §4.1 says it "uses `createServices` with node platform adapters". The routes only validate and forward to these same services.
- Reversible: yes.

### D-0234 — `openRuntime` is shared with `startServer`

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 1 (#54) · Status: decided
- Decision: The node wiring (data folder, upgrade gate, storage, job handlers, job runner, services) moves out of `startServer` into `platform/node/runtime.ts`, exported as `@senstosales/api/node`.
- Alternatives: Copy the wiring into the tool.
- Why: The corpus import must exercise the same adapters and job handlers the app runs.
- Reversible: yes.

### D-0235 — Corpus tool files sit in `tools/corpus/src` and `tools/corpus/test`

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 1 (#54) · Status: decided
- Decision: The runner and its tests live in `tools/corpus/src` and `tools/corpus/test`, not at `tools/corpus/*.ts` as SPEC-09 §4.1 lists them.
- Alternatives: The spec's paths.
- Why: Vitest only collects `{packages,apps,tools}/*/test/**/*.test.ts`, and every other tool uses `src/` and `test/`.
- Reversible: yes.

### D-0236 — What a passing corpus import means

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 1 (#54) · Status: decided
- Decision: A run passes when both jobs end `done` and no service logged a warning or error (such as a job summary that could not be built). Pages skipped or failed with a typed reason do not fail the run; the report (PR 2) lists them. Pages over the 10 MB request cap are not sent, as the web client does not send them, and are returned in `tooLarge`.
- Alternatives: Fail on any failed page.
- Why: The L4 exit is "no unexpected exception"; typed failures are expected outcomes.
- Reversible: yes.

### D-0237 — The corpus data folder is kept

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 1 (#54) · Status: decided
- Decision: The data folder stays in the OS temp folder after the run, and its path is printed.
- Alternatives: Delete it after the run.
- Why: PR 2's report and PR 3's second import read it.
- Reversible: yes.

### D-0253 — Corpus report totals are read inside `importCorpus`; `buildReport` is pure

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 2 (#56) · Status: decided
- Decision: `importCorpus` reads `readTotals(db)` before it closes the database and returns them as `totals`; `buildReport(run)` takes that result, with no database argument.
- Alternatives: `buildReport(jobSummaries, db)` as SPEC-09 §4.1 lists it.
- Why: The runner owns and closes the database; a pure builder is tested on the real import's output.
- Reversible: yes.

### D-0254 — Corpus report flags by type count every flag in the database

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 2 (#56) · Status: decided
- Decision: The "In the database" column counts flags of any status, beside the flags each job opened, from the job summaries.
- Alternatives: Open flags only.
- Why: A fresh import has no acknowledged flags, so the two are equal there; on a second import into the same data folder, the per-job columns show what the import added.
- Reversible: yes.

### D-0255 — A `SENSTO_REPORT_DIR` inside the repo is refused before the import

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 2 (#56) · Status: decided
- Decision: The runner exits 1 with a plain message and makes no data folder.
- Alternatives: Ignore the setting and fall back to the temp folder.
- Why: SPEC-09 §2 says the report is never written inside the repo, and failing at once costs no import time.
- Reversible: yes.

### D-0256 — Pages too large to send are a separate list in the corpus report

- Date: 2026-10-15 · Spec/PR: SPEC-09 PR 2 (#56) · Status: decided
- Decision: They get their own markdown section, table column and `tooLarge` JSON field, and are counted in `pages`, never folded into failed.
- Alternatives: Report them as failed pages.
- Why: The job never saw them, so the job's failed count stays the job's own; listing them separately still accounts for every page (#54 review).
- Reversible: yes.
