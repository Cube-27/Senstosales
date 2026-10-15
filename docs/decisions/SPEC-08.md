# SPEC-08 decisions

Decisions for [SPEC-08 — Ingestion services and the job model](../specs/SPEC-08-ingestion-jobs.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0140 — Recompute accepts loaded rows with pending changes

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 2 (#37) · Status: decided
- Decision: `recomputeStatements(deps, snapshot)` is exported with `loadPoSnapshot`; `recomputePo(poId)` is load plus statements. A batch that also changes the PO's rows (ingest, DC create) loads the snapshot, applies its own pending changes in memory, and recomputes from that.
- Alternatives: `recomputePo(poId)` only, as in SPEC-08 §4.1.
- Why: A batch's writes are not visible to a read before it commits (C4), so recompute from stored rows alone would derive from the previous state.
- Reversible: yes.

### D-0141 — One `source_document` row per stored file

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 2 (#37) · Status: decided
- Decision: Storing a page for a `(supplier, kind, key)` deletes the earlier row and inserts the new one in the same batch, so the row describes the bytes at its storage key.
- Alternatives: Append a row per ingestion.
- Why: The storage key is per PO and is overwritten, so older rows would cite a hash that is no longer stored.
- Reversible: yes.

### D-0142 — Recompute leaves the PO version alone

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 2 (#37) · Status: decided
- Decision: Derived columns and PO totals are written with a plain update; `po.version` is not bumped.
- Alternatives: Bump the version on every recompute.
- Why: INV-95 guards user edits; bumping on every SRV ingest would turn an open edit into a false conflict.
- Reversible: yes.

### D-0143 — In-house ULID generator

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 2 (#37) · Status: decided
- Decision: `apps/api/src/ids.ts` `newId()` builds a ULID (48-bit milliseconds, 80 random bits from Web Crypto) with no dependency.
- Alternatives: The `ulid` npm package.
- Why: About ten lines, no supply-chain surface, and it runs on Node and Workers.
- Reversible: yes.

### D-0144 — A source-document key that is not a PO number is refused with 400

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 2 (#37) · Status: decided
- Decision: `storeSourceDocument` refuses a key that is not `^\d{1,10}$` (`zPoId`) with 400 `bad-po-number`, and stores nothing.
- Alternatives: Rely on the Storage adapter's key check alone.
- Why: The key becomes a storage path (C17).
- Reversible: yes.

### D-0145 — Storing a source document is its own batch with its own audit row

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 2 (#37) · Status: decided
- Decision: Storing a source document commits its raw HTML record and audit row in a batch of its own, before parsing.
- Alternatives: Store the record in the same batch as the parsed rows.
- Why: A page that later fails to parse is still kept.
- Reversible: yes.

### D-0155 — The Jobs port only schedules (`enqueue`, `holds`)

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: The jobs service queues the row (it generates the id and runs the queue check), and the `Jobs` port only schedules the run (`enqueue(id, start)`) and says whether it holds a job (`holds(id)`). Claim, progress, the cancel flag and finish are repository statements that the job-worker service commits.
- Alternatives: A port with `enqueue/claim/progress/isCancelRequested/finish`, as SPEC-08 §4.1 lists.
- Why: Those calls are made by one service against the `job` table, so a port for them adds a layer with one caller; ids stay in services (C4). SPEC-19 and SPEC-21 register a `JobHandler` and do not call the port.
- Reversible: yes.

### D-0156 — Job parameters are held in memory

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: The start body is passed to the runner in memory, so a job runs only in the process that queued it (EC-28).
- Alternatives: A `params_json` column on `job`, which changes ARCHITECTURE §8.2 and needs the owner.
- Why: It keeps the table as specified.
- Reversible: yes.

### D-0157 — A start is refused while any job is queued or running

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: `POST /api/jobs` answers 409 `job-running` while a job is queued or running, not only running. The check and the insert are one `INSERT … SELECT … WHERE NOT EXISTS` statement.
- Alternatives: Refuse only while a job is running, the scope of the partial unique index.
- Why: INV-98 says "a second start is 409" and "single active job"; otherwise a queued job would wait behind the running one.
- Reversible: yes.

### D-0158 — Job progress counts are disjoint

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: `done`, `skipped` and `failed` are disjoint (`done` = processed without a skip or failure). `current` is the next document, written with each document's counts, and `null` once the job ends. A failed or cancelled job keeps the counts its committed batches reached.
- Alternatives: `done` counts every processed document.
- Why: The folder-import summary needs the three counts separately.
- Reversible: yes.

### D-0159 — Job bookkeeping writes no audit row

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: Queueing, claiming, progress, cancel and finish write no `audit_log` row.
- Alternatives: An audit row per job write.
- Why: The audit log records changes to business data. Job state is operational and has its own `job_event` log, and auditing it would add a row per document.
- Reversible: yes.

### D-0160 — The job list shows newest first by default

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: `GET /api/jobs` lists newest first unless `sort=createdAt` is given; ids break ties.
- Alternatives: Always use the `dir` default (`asc`).
- Why: The latest job is the one the UI shows.
- Reversible: yes.

### D-0161 — Cancelling a finished job returns it unchanged

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: Cancelling a `done`, `failed` or `cancelled` job answers 200 with the job as it is (`cancelRequested` stays false).
- Alternatives: 409.
- Why: Cancelling something already over is harmless, and the user needs no error (C11).
- Reversible: yes.

### D-0162 — A job type with no handler fails plainly

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: Until a type's handler exists, starting it creates a job that ends `failed` with "This kind of job is not available yet."
- Alternatives: 400 at start.
- Why: It needs no extra port method, and the job list shows what happened.
- Reversible: yes.

### D-0163 — Ids made in the same millisecond count up

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: `newId` increments the random part when it is called again in the same millisecond, so ids sort in the order they were made.
- Alternatives: Order job events by `at`.
- Why: Job events are ordered by id; events written in the same millisecond would otherwise come back in random order.
- Reversible: yes.

### D-0164 — Cancel ends a job no worker holds

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 1 (#40) · Status: decided
- Decision: Cancelling a queued or running job that the `Jobs` adapter does not hold (one left by an earlier run of the app) commits the cancel flag and finishes the job as `cancelled` (stored progress, `current` null) in one batch, so a new start works (EC-28).
- Alternatives: Leave the row blocking every start until the database is edited by hand.
- Why: Cancel is the spec's own way out, and C11 forbids CLI-only recovery. This was review item 1 on #40.
- Reversible: yes.

### D-0178 — An upload parses first; the PO number is the storage key

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: An uploaded PO page is parsed first to learn its PO number, the key of `html/po/<po>.html`. The date guard runs next; only an accepted page is stored, with its PO date, before the ingest batch. A page that does not parse fails with the parser's code and message and is not stored (EC-29).
- Alternatives: Key unparseable uploads by a ULID, which would need a new key space and a change to D-0144.
- Why: An upload has no PO number before parsing. Storing after the guard means a skipped older upload never replaces the stored page. Scrapes (SPEC-19) know the key first and still store before parsing; the user still has the uploaded file.
- Reversible: yes.

### D-0179 — Ingest context from the one supplier row

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: `ingestContext(db, jobId)` reads the install's supplier (A2-12) and uses `ACTOR`. With no supplier yet it throws `onboardingRequired()` (409).
- Alternatives: Take the supplier from the session; rely only on the app's onboarding gate.
- Why: There is one supplier and one user per install. Upload and the import jobs share one context.
- Reversible: yes.

### D-0180 — A PO re-ingest updates the header with a version check

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: An accepted re-ingest updates the header with `updateWithVersion` against the version the guard read: it bumps the version, and a PO changed by another upload since the guard read it fails that file instead of being overwritten. Recompute alone still leaves the version alone (D-0142).
- Alternatives: A plain update without a version bump.
- Why: The document really changed, so an edit opened on the earlier page gets a 409 (INV-95). The guard is read outside the batch (C4), so the check in the statement stops a concurrent older upload from winning (INV-42).
- Reversible: yes.

### D-0181 — Lots are replaced per page item; a cancelled item keeps its lots

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: The lots of each item on the page are deleted and re-inserted from the page. An item cancelled by the amendment keeps its last lots.
- Alternatives: Delete the lots of cancelled items too.
- Why: The most conservative reading of INV-42 and INV-48: cancelling changes only `cancelled_at`.
- Reversible: yes.

### D-0182 — Unmatched SRV lines are matched on every accepted PO ingest

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: The PO batch matches every unmatched line of the supplier's SRVs with that PO number (INV-39), and sets `srv.po_id` on SRVs stored while the PO was not found (INV-40).
- Alternatives: Attach and match only SRVs that were not found, as SPEC-08 §4.2 lists.
- Why: When an amendment adds an item, INV-39 matches the line that has its material code; otherwise that receipt would never count.
- Reversible: yes.

### D-0183 — `splitUpload` lives in `packages/schemas` with `MAX_BODY_BYTES`

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: The web client's upload split and the API's body limit share one constant in `packages/schemas`. A file that alone exceeds the cap is returned in `tooLarge` and not sent.
- Alternatives: A helper in `apps/web` with its own constant; send oversize files and get a 413.
- Why: One constant for both sides; a 413 would fail every other file in the same request.
- Reversible: yes.

### D-0184 — `matchSrvItem` takes null material codes

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: `PoItemRef.materialCode` is `string | null`; a line with no code matches nothing.
- Alternatives: Filter nulls in each caller.
- Why: Stored items and SRV lines are nullable in the schema; PO and SRV ingest would otherwise each re-interpret INV-39.
- Reversible: yes.

### D-0185 — `po.buyer_id` is left null on ingest

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: Ingest does not map the page's division to a buyer.
- Alternatives: Match the division text to `buyer.unit_name`.
- Why: No spec or Appendix A rule defines that mapping (C2).
- Reversible: yes.

### D-0186 — `createServices` exposes `poIngest`; `ServiceDeps` carries `Storage`

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 3 (#42) · Status: decided
- Decision: `createServices` builds `poIngest` from `ServiceDeps`, which now includes the `Storage` port; `apiRoutes` mounts `po.upload` from it and `main.ts` passes the data folder's fs storage.
- Alternatives: Build the ingest deps in `main.ts`.
- Why: Routes call use cases through `createServices` (SPEC-07 §4.1), and SRV ingest and the import jobs need the same storage.
- Reversible: yes.

### D-0187 — Uploaded SRV pages are stored once parsed

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: An SRV upload stores its raw page after `parseSrv` succeeds, keyed by the file's PO number, as PO uploads do (EC-29 now names SRV pages too).
- Alternatives: Store it under another key before parsing.
- Why: The key is the PO number (INV-107, C17), and an upload only knows it after parsing.
- Reversible: yes.

### D-0188 — A replaced SRV keeps its ids

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: Re-ingesting an SRV keeps its `srv.id`, and each item keeps its `srv_item.id` when its `(po_item_no, lot_no, srv_item_no)` key is unchanged. Items whose key is gone are deleted.
- Alternatives: Delete everything and insert with new ids.
- Why: Flag fingerprints cite the `srv_item` id; new ids would add a second copy of every open SRV flag on each re-upload (INV-59).
- Reversible: yes.

### D-0189 — A missing SRV ORD QTY is stored as 0, and 0 raises no QTY_MISMATCH

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: A page without an ORD QTY column (one real layout) or with an empty cell stores `ord_qty` 0, and `detectFlags` compares only a positive SRV `ord_qty` (EC-31).
- Alternatives: Make `srv_item.ord_qty_m` nullable (a migration on a table other specs read; D-0071 chose NOT NULL); fail such files.
- Why: The spec does not cover it; legacy stores 0 and skips the check when the SRV ord qty is <= 0 (C18).
- Reversible: yes.

### D-0190 — SRV numbers resolve against all of the supplier's DCs and invoices

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: Challan and invoice numbers resolve against every DC and invoice of the supplier, not only those on the SRV's PO, unattached SRVs included.
- Alternatives: Restrict candidates to the SRV's PO.
- Why: INV-37 and ARCHITECTURE §6.10 name only the number and the FY; restricting by PO would add a rule.
- Reversible: yes.

### D-0191 — Per-file SRV upload results

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: A file is `skipped` only when every SRV in it is older than the stored one. Otherwise it is `accepted`, and `reason` names any skipped SRVs and a missing PO ("PO not found"). A failure says nothing from the file was saved.
- Alternatives: One result per SRV, which the frozen response shape does not allow.
- Why: The response has one result per file.
- Reversible: yes.

### D-0192 — One audit row per SRV written

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: Each SRV a file writes gets one audit row: `srv.ingest`, entity `srv`, with the before and after date.
- Alternatives: One row per file.
- Why: Each SRV is the entity that changes, and a file can hold several SRVs.
- Reversible: yes.

### D-0193 — An SRV file's document date

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 4 (#43) · Status: decided
- Decision: `source_document.doc_date` for an SRV file is its newest SRV date.
- Alternatives: `null`.
- Why: A file holds every SRV of one PO.
- Reversible: yes.

### D-0205 — Folder-import staging layout

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 5 (#47) · Status: decided
- Decision: Each staged file is stored as `{name, html}` JSON at `staging/<stagingId>/<kind>/<ulid>.json`. A job reads only its own kind's folder. Ids count up in the order they are made (D-0163), so files are ingested in the order they were staged.
- Alternatives: Put the file name in the key; keep a per-staging manifest.
- Why: A key built from the request's file name would break C17. A manifest would need read-modify-write across batches.
- Reversible: yes.

### D-0206 — Job documents carry a key and a label

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 5 (#47) · Status: decided
- Decision: `JobHandler.documents()` returns `{ key, label }`. `process` gets the key, and `current` and job events show the label.
- Alternatives: One string, which for folder import would show the storage key to the user.
- Why: The progress panel and the summary must name the file.
- Reversible: yes.

### D-0207 — The worker writes a common job summary

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 5 (#47) · Status: decided
- Decision: Every job with a handler ends with `summary = { total, done, skipped, failed, skippedDocuments, failedDocuments, ...finish() }`, where each document entry is `{document, reason}`. `finish` runs after any end (done, cancelled or failed). If it throws, it is logged and its part is left out.
- Alternatives: Each handler builds its whole summary from the job row and events.
- Why: The counts and issues are the same for every job type (§7.4), so later job types get them for free.
- Reversible: yes.

### D-0208 — Flags by type = flags opened since the job started

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 5 (#47) · Status: decided
- Decision: The folder-import summary counts `reconciliation_issue` rows with `opened_at >= job.started_at`, by type.
- Alternatives: A `job_id` column on `reconciliation_issue`, which changes ARCHITECTURE §8.2.
- Why: Only one job runs at a time (INV-98). A flag a user raises by hand during the import would also be counted.
- Reversible: yes.

### D-0209 — Staged files are deleted however the job ends

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 5 (#47) · Status: decided
- Decision: `finish` deletes them after done, cancelled and failed alike. To retry, the user stages the folder again.
- Alternatives: Keep them after a failure.
- Why: SPEC-08 §9 says "deleted after the job".
- Reversible: yes.

### D-0210 — Empty staging fails the job

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 5 (#47) · Status: decided
- Decision: A folder-import job whose staging area holds no files of its kind ends `failed` with "No files were uploaded for this import. Choose the folder again."
- Alternatives: End `done` with zero files.
- Why: The user should see that nothing was imported.
- Reversible: yes.

### D-0223 — recompute-all writes one audit row per PO

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 6 (#51) · Status: decided
- Decision: Each PO's batch carries a `po.recompute` audit row (entity `po`, `job_id` set, no before/after), whether or not any value changed.
- Alternatives: No audit row, as for job bookkeeping (D-0159); an audit row only for POs whose values changed, with before/after.
- Why: C4: every write batch carries its audit row, and this batch writes business tables. Diffing every column would add code and work to a rare repair job; `job_id` ties the rows to the job.
- Reversible: yes.

### D-0224 — In recompute-all a refused PO fails alone and a deleted PO is skipped

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 6 (#51) · Status: decided
- Decision: A `DbError` on one PO's batch is a failed document ("Could not be recomputed. Its stored values were kept.") and the job goes on. A PO deleted between listing and processing is a skipped document ("This PO was deleted after the job started."). Any other error fails the job.
- Alternatives: Every error fails the whole job.
- Why: SPEC-08 §4.3 and INV-50 handle failures per document for the other job types, and a PO deleted mid-job is not an error.
- Reversible: yes.

### D-0225 — recompute-all works through POs in numeric PO-number order

- Date: 2026-10-15 · Spec/PR: SPEC-08 PR 6 (#51) · Status: decided
- Decision: The job's documents follow the PO list's `byPoNumber` order (numeric, then text); each is labelled with its PO number.
- Alternatives: Id order; text order.
- Why: The progress panel walks the POs in the order the PO list shows them.
- Reversible: yes.
