# SPEC-01 — Spikes (L0.5)

Layer: L0.5. Architecture refs: §15 (L0.5), §3, §4.1 (`Db`, `Scraper`), §7.1, §7.5, §8.3, §11.1, §13.1.

## 1. Summary

Five time-boxed experiments that retire the technical risks the architecture names before the layers that depend
on them start: the Tauri + Node SEA sidecar lifecycle, the BHEL login with captcha and OTP through the system Edge,
node:sqlite + Drizzle batches with the same SQL on D1, exceljs output fidelity for 1/20/21/60-item documents, and
parser feasibility on the real corpus. Each spike ends in a `docs/DECISIONS.md` entry (and an ADR under `docs/adr/`
when it fixes a mechanism) with measured results. A spike never changes an architecture decision; if a result
contradicts one, it is escalated (`needs-owner`) and the architecture is not edited here.

## 2. Scope

Core:
- One PR per spike. The merged content is the decision record only. Prototype code stays on the spike branch,
  tagged `spike/<name>` and linked from the record; it is not merged and later specs rewrite the mechanism properly.
- Records contain no real data (C1): no PO/SRV numbers, supplier identity, page excerpts or corpus counts.
  Corpus results are reported as ratios or pass/fail (identifying record counts are forbidden).

Out of scope:
- Production implementations (SPEC-05, -06, -12, -19, -20 build them).
- Candidates: Chrome / on-demand Chromium fallback (K8), Browser Rendering (K1).

## 3. Dependencies

- SPEC-00 PR 1 (workspace, CI).
- Human tasks: H3 (BHEL portal credentials and OTP mailbox, owner's machine only) for spike 2; H4
  (`SENSTO_CORPUS_DIR` on the build machine) for spike 5; H5 (legacy app run on synthetic data, for legacy reference
  output) for spike 4.

## 4. Design

### 4.1 Sidecar lifecycle (§13.1)
Questions: does a Node 24 SEA bundle of a Hono app (with `node:sqlite`) start reliably; how does the shell learn the
random port (stdout line vs file); single-instance focus; closing the window ends the sidecar (verified by PID);
install path with spaces and non-ASCII characters; SEA size and cold start time. Fallback named by the architecture:
`node.exe` plus the bundle. Output: ADR "sidecar packaging and port handoff".

### 4.2 Edge login (§7.5)
On the owner's machine: `playwright-core` with `channel: 'msedge'`, headless, fixed user agent, no other flags;
dismiss pop-ups; captcha element screenshot as PNG; submit supplier code + password + captcha; detect the OTP step;
submit OTP; confirm by the supplier PO page; then reuse cookies in a plain HTTP session to list PO ids and fetch one
PO and one SRV page. Record which selector strategies work (by role/label/structure, described generically) and
the session lifetime observed. Output: DECISIONS entry "scraper flow and selectors".

### 4.3 node:sqlite + Drizzle + D1 (§4.1, §8.3)
`drizzle-orm/sqlite-proxy` over `node:sqlite`; `batch` as `BEGIN IMMEDIATE … COMMIT` with rollback on a failing
statement (atomicity proof); the §8.3 PRAGMAs; the online backup API from Node; the same migration SQL applied to a
local D1 (`wrangler d1 execute --local`); a 5k-row batch timing. Output: ADR "Db port executors"; if node:sqlite is
unfit, the record names the alternative and escalates (the architecture names node:sqlite).

### 4.4 exceljs output fidelity (§11.1, INV-69)
Build DC, invoice and GC files for 1, 20, 21 and 60 items from de-branded template copies with exceljs, comparing
two strategies (fill a template and add rows, or generate item rows directly). Compare with legacy output for the
same synthetic input (H5) using a prototype xlsx-to-JSON snapshot (values, styles, merges, number formats, column
widths, row heights, print area, page breaks), and by opening both in Excel. Output: ADR "document generation
strategy" and the snapshot format that SPEC-12 adopts.

### 4.5 Parser feasibility (§7.1, §14.3)
Locally over `SENSTO_CORPUS_DIR`: cheerio parse of PO and SRV pages of both eras; comment skipping; UTF-8 with
replacement; date formats; files the legacy parser failed on. Prototype the anonymiser on five files and check the
output passes the real-data scan. Output: DECISIONS entry "parser approach" (ratios only).

## 5. Invariants

None established. Spikes inform INV-69 (spike 4), INV-84 (spike 3), INV-86 (spike 2), INV-75 (spike 5).

## 6. Testing strategy

Each spike states its questions, method, results with numbers, and decision. Measurements are reproducible from the
tagged branch. No CI test is added.

## 7. Acceptance criteria

- [ ] Five DECISIONS entries (and the named ADRs) merged, each answering its questions with measurements.
- [ ] No record contains real data; the real-data scan passes on each PR.
- [ ] Any result that contradicts ARCHITECTURE is an escalation (`needs-owner`), not an edit.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | Spike: sidecar lifecycle | `docs/adr/0001-sidecar-packaging.md`, `docs/DECISIONS.md` entry; prototype on `spike/sidecar` | `check`, `real-data-scan` | The record shows start, port handoff, single-instance, close-kills-sidecar (PID), spaces/non-ASCII path results, SEA size and cold start, and the chosen handoff. |
| 2 | Spike: Edge login with captcha and OTP | `docs/DECISIONS.md` entry "scraper flow and selectors"; prototype on `spike/edge-login` | `real-data-scan` | Run on the owner's machine (H3): captcha shown, OTP accepted, PO list fetched and one PO and one SRV page fetched over the cookie session; selector strategies recorded generically. |
| 3 | Spike: node:sqlite + Drizzle batch + D1 | `docs/adr/0002-db-executors.md`, DECISIONS entry; prototype on `spike/db` | `check`, `real-data-scan` | Atomic rollback demonstrated; PRAGMAs and online backup work; the same SQL applies on D1 local; 5k-row batch time recorded. |
| 4 | Spike: exceljs output fidelity 1/20/21/60 | `docs/adr/0003-document-generation.md` (strategy, snapshot format), DECISIONS entry; prototype on `spike/excel` | `real-data-scan` | DC, invoice and GC at 1/20/21/60 items compared with legacy output by snapshot and visually; the strategy and snapshot format are chosen. |
| 5 | Spike: parser feasibility | DECISIONS entry "parser approach"; prototype parser and anonymiser on `spike/parsers` | `real-data-scan` | Both page eras and both SRV layouts parse in the prototype; legacy-failing files explained; five anonymised samples pass the scan (not committed). |

## 9. Open issues

- Merging only the record (not the prototype) is an implementation detail chosen to keep `main` free of throwaway
  code; recorded in DECISIONS.
- Spike 4 needs legacy reference output generated from synthetic input by running the legacy app outside the repo
  (H5). The legacy outputs are never committed; only snapshots of synthetic data are, after review (SPEC-12).
