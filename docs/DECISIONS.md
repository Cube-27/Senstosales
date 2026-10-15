# Decisions log

Agents log the decisions they make while writing specs and implementing them. Owner decisions belong in
ARCHITECTURE Appendix A; open owner questions belong in OPEN_QUESTIONS.md. What goes here and when to escalate:
`CLAUDE.md` §4–§5. While an orchestrator runs, workers put decisions in their PR body and the implementor copies
them here in its tracker commit before `READY`, under the IDs the orchestrator gave at assignment (`CLAUDE.md` §3).

**Statuses:**

- `decided`: made by an agent within its authority. Stands unless the owner overrides it.
- `pending-owner`: a default an agent chose that the owner should confirm. Work proceeds on it.
- `needs-owner`: blocking. Work that depends on it stops until the owner answers.
- `decided-owner`: decided by the owner directly.
- `confirmed` / `overridden`: the owner's answer, with the date.
- `superseded`: replaced by a later entry. Link it.

**Rules:**

- Entries are append-only. To change a decision, add a new entry and mark the old one `superseded`.
- Keep each entry under about ten lines. Don't log trivial choices.
- No customer names and no secrets.

**Template:**

```
### D-NNNN — <title>
- Date: YYYY-MM-DD · Spec/PR: SPEC-NN PR M (#PR) · Status: decided | pending-owner | needs-owner
- Decision: <one or two sentences>
- Alternatives: <what else was considered>
- Why: <reason; cite ARCHITECTURE/spec sections or measured results>
- Reversible: yes | costly | no — <what reversing would take>
- Owner answer: <filled when confirmed or overridden>
```

---

## Index of open items

Items with status `needs-owner` or `pending-owner`. Keep this list current.

None.

---

## Entries

### D-0001 — No release-age quarantine; trust policy no-downgrade

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 1 · Status: decided-owner
- Decision: `pnpm-workspace.yaml` sets `minimumReleaseAge: 0` with `trustPolicy: no-downgrade` (`trustPolicyIgnoreAfter` one year). There is no `.npmrc` release-age setting.
- Alternatives: pnpm's one-day default quarantine; a longer `minimumReleaseAge`.
- Why: Vite+ ships new dependency versions that a quarantine blocks; `no-downgrade` still refuses a release whose provenance or signature weakens. SPEC-00 §4.2 updated to match.
- Reversible: yes — change two settings in `pnpm-workspace.yaml`.
- Owner answer: Owner decision, 2026-10-14.

### D-0002 — Toolchain: Vite+ (Oxlint, Oxfmt, Vitest), TypeScript 7, no ESLint or Prettier

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 1 · Status: decided-owner
- Decision: `vp` is the single CLI: Oxlint (`vp lint`, including the C15 limits), Oxfmt (`vp fmt`), Vitest (`vp test`, imports from `vite-plus/test`), `vp staged` hooks. TypeScript 7 strict with `tsc -b`. Vite+ is not version-pinned through a catalog. No ESLint, Prettier or separate hook manager.
- Alternatives: ESLint + Prettier + lefthook; TypeScript 5.x.
- Why: One config and one CLI; Oxlint carries `max-lines` and `complexity` for C15 (SPEC-00 §4.2, README cross-cutting facts).
- Reversible: costly — lint and format configs and every test import would change.
- Owner answer: Owner decision, 2026-10-14.

### D-0003 — BHEL buyer seed: none

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 5 · Status: decided
- Decision: The seed holds no buyer rows; the user adds BHEL units through the buyers settings (legacy UI).
- Alternatives: Seed a full public list of BHEL units with their GSTINs allowlisted in the real-data scan.
- Why: C1 forbids GSTINs in the repo, and seeding only the units one supplier deals with would identify it (SPEC-05 Open issues).
- Reversible: yes — a later seed migration can add the public list.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0004 — Initial password `admin`, no forced change

- Date: 2026-10-14 · Spec/PR: SPEC-07 PR 4 · Status: decided
- Decision: First run uses the legacy default password `admin` with the legacy "default password" notice; it is changed in Settings, never forced (C11).
- Alternatives: Set a password during onboarding; force a change on first login (refused by C11).
- Why: Matches legacy behaviour; §10.3 does not say how the first password is set (SPEC-07 Open issues, SPEC-15 Open issues).
- Reversible: yes — an onboarding step can be added later.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0005 — Cell safety applies to text cells only

- Date: 2026-10-14 · Spec/PR: SPEC-13 PR 2 · Status: decided
- Decision: Text values from users or BHEL pages are written as string cells (CSV text cells starting with `=`, `+`, `-`, `@` get a leading `'`); numeric values stay numeric with their legacy number formats (INV-94).
- Alternatives: Write every cell as a string, as §10.4 literally reads.
- Why: INV-68 freezes the legacy number formats; formulas can only enter through text (SPEC-13 Open issues).
- Reversible: yes — one writer function.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0006 — DC and invoice list exports named `.csv`

- Date: 2026-10-14 · Spec/PR: SPEC-13 PR 3 · Status: decided
- Decision: The DC and invoice list exports keep their CSV content and get a `.csv` file name.
- Alternatives: Keep the legacy `.xlsx` name on CSV content; produce real xlsx.
- Why: The legacy name/content mismatch is a bug fix A-2 allows. ARCHITECTURE §11.2 does not list these exports yet; adding them is an owner edit (SPEC-13 Open issues).
- Reversible: yes — a file-name constant.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0007 — Downloads are not logged

- Date: 2026-10-14 · Spec/PR: SPEC-12 PR 6 · Status: decided
- Decision: v1 writes no audit or ledger row for document or export downloads; the ledger screen shows the audit rows.
- Alternatives: Log download events as legacy did.
- Why: `audit_log` holds one row per write batch and a download is not a write (SPEC-12 Open issues).
- Reversible: yes — add an event write to the download routes.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0008 — Minimal Rust Tauri scaffold outside the language check

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 2, SPEC-20 PR 2 · Status: decided
- Decision: `apps/desktop/src-tauri/` holds only the generated minimal Tauri entry (`main.rs`, no logic); the INV-90 language check covers `packages/*/src`, `apps/{api,web}/src` and `apps/desktop/src`. Sidecar control lives in TypeScript.
- Alternatives: Extend the language check to `src-tauri/` (fails on the required Rust entry); allow Rust logic in the shell.
- Why: Tauri 2 needs a Rust entry; keeping it a scaffold keeps all logic in TypeScript (SPEC-00 Open issues, SPEC-20 Open issues).
- Reversible: costly — a different shell would replace SPEC-20.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0009 — Money rounding: half-up

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 · Status: decided
- Decision: `round2`/`round5` round exact ties half-up on the exact integer result.
- Alternatives: Half-even (banker's rounding).
- Why: The spec does not state the tie rule; half-up is the conservative reading. SPEC-12 invoice goldens from legacy output are the arbiter; a mismatch is escalated, not silently changed (SPEC-03 Open issues).
- Reversible: yes — one domain function and its table tests.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0010 — No hashed denylist in the real-data scan

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 3 · Status: decided-owner
- Decision: The real-data scan drops the hashed denylist, its shingle hashing, the `denylist` rule and the CI secret `SENSTO_DENYLIST`; human task H2 is dropped. Excel files may be committed and their contents are not scanned. SPEC-00 PR 3 becomes the company-details check: a `mobile` rule for Indian mobile numbers, plus the gitignored `tools/checks/company-details.local.txt` matched case-insensitively as substrings by the hook and local `pnpm verify`, skipped silently when absent (CI, forks). Other real data is kept out by review.
- Alternatives: Hashed token and shingle denylist held in a CI secret (SPEC-00 §4.6 as first written); scanning xlsx XML parts.
- Why: Owner: nothing in it is sensitive, it just shouldn't be pushed, and heavy enforcement isn't worth it since an agent could bypass any check anyway; a local file costs no CI time. Templates and goldens need realistic sample data. ARCHITECTURE §14.3 (rev 1.1), INV-74, SPEC-00 §4.6 and SPEC-12 §6 updated.
- Reversible: yes — the scan can gain a rule later.
- Owner answer: Owner decision, 2026-10-14.

### D-0011 — Mobile rule prefix form

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 3 (#3) · Status: decided
- Decision: The `mobile` rule takes an optional `+91` or `0` prefix glued to 10 digits starting 6–9, bounded by non-digits; a bare `91` prefix is not matched (`+91 98…` with a space still matches).
- Alternatives: Also accept a bare `91` prefix.
- Why: Literal reading of SPEC-00 §4.6; a bare `91` plus 10 digits is a 12-digit run that would also match unrelated numbers.
- Reversible: yes.

### D-0012 — Company-details file format

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 3 (#3) · Status: decided
- Decision: Each non-blank line of `tools/checks/company-details.local.txt`, trimmed, is one value; there is no comment syntax.
- Alternatives: `#` comment lines.
- Why: Addresses can contain `#`; SPEC-00 §4.6 says one value per line.
- Reversible: yes.

### D-0013 — Strict allowlist format

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 3 (#3) · Status: decided
- Decision: A `real-data-allow.txt` line that is not `path:rule  # justification` with a rule the scan has fails the scan, naming the line.
- Alternatives: Warn only.
- Why: A silently ignored entry or an exception without a justification is what the PR 3 format check exists to prevent.
- Reversible: yes.

### D-0014 — Commit the pre-commit hook script

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 3 (#3) · Status: decided
- Decision: `.vite-hooks/pre-commit` (`vp staged`) is committed; PR 1 had only the Vite+ dispatcher, which exits 0 without it, so no staged check ran. A regression test checks the script and the `vite.config.ts` staged task. Each checkout still needs `pnpm hooks` once (the dispatcher dir is per checkout, contrary to SPEC-00 §4.4's wording).
- Alternatives: Fix it in a separate PR.
- Why: PR 3's "blocked by the staged hook" criterion cannot hold without it.
- Reversible: yes.

### D-0015 — UI primitives from shadcn/ui

- Date: 2026-10-14 · Spec/PR: SPEC-14 PR 5 · Status: decided-owner
- Decision: UI primitives are shadcn/ui components generated with the shadcn CLI into `apps/web/src/components/ui/` (owned MIT source, not a package) and restyled to the `globals.css` tokens; runtime dependencies are Radix UI, cva, clsx and tailwind-merge. The DataTable stays custom on TanStack Table with the C8 fixed-layout, no-shift pager rules.
- Alternatives: Port the legacy primitives (SPEC-14 PR 5 as first written); the shadcn data-table.
- Why: Accessible, maintained primitives with less owned code to write. ARCHITECTURE §12.3 and §16 (rev 1.2) and SPEC-14 §1, §2, §4.1 and PR 5 updated.
- Reversible: costly — every primitive would be rewritten.
- Owner answer: Owner decision, 2026-10-14.

### D-0016 — The UI freeze covers flows and on-screen elements

- Date: 2026-10-14 · Spec/PR: — · Status: decided-owner
- Decision: Frozen means the user flows and the set of on-screen elements: no flow changes and no added or removed elements, routes, labels or columns. Minor visual changes are allowed when they reduce maintenance, improve performance or increase consistency (e.g. shadcn/ui defaults where the difference is cosmetic, unified spacing and states). CSV/Excel layouts stay frozen cell for cell.
- Alternatives: Pixel-level match to legacy with only bug, accessibility, usability and consistency fixes (rev 1.1 wording).
- Why: A pixel match would make every shadcn/ui default a deviation (D-0015) with no benefit to users. ARCHITECTURE §1, §2 C7, §12.2 and A-2 (rev 1.2), CLAUDE.md C7, INV-66, INV-67, `docs/specs/README.md`, SPEC-14 and SPEC-15/16/17 (§1 and screenshot criteria) updated.
- Reversible: yes — reword C7 back.
- Owner answer: Owner decision, 2026-10-14.

### D-0017 — Db port executors

- Date: 2026-10-14 · Spec/PR: SPEC-01 PR 3 (#5) · Status: decided
- Decision: Keep node:sqlite + `drizzle-orm/sqlite-proxy`. The `Db` port wraps Drizzle and exposes only `query` and `batch`. PRAGMAs are set by the node executor only. Migrations carry no transaction statements, and the SPEC-05 lint enforces the §8.3 allowlist. The node build checks the version with `user_version`; a D1 executor (K1) must read `schema_migration`. Batch statement shape is left to SPEC-05. Details: `docs/adr/0002-db-executors.md`.
- Alternatives: Expose Drizzle's `transaction()` (separate BEGIN/COMMIT, which C4 forbids and D1 refuses); mandate single-row batches now (hosted D1 limits unverified); `schema_migration` as the only version source now (the §13.3 wording would change).
- Why: Measured in the spike (ADR 0002 Results). Local D1 refuses `PRAGMA user_version`, `journal_mode`, `BEGIN` and `SAVEPOINT`, and accepts triggers and views.
- Reversible: yes — nothing is built yet; SPEC-05 implements it.

### D-0018 — No Python in the repo tooling

- Date: 2026-10-14 · Spec/PR: tooling PR (#10) · Status: decided
- Decision: The merge guard is TypeScript (`tools/orchestrator/src/merge-guard.ts`, run by `node` with no build step, behaviour identical to `merge_guard.py`); the hook in `.claude/settings.json` denies when `node` or the script fails. The orchestrator tests are Vitest under `tools/orchestrator/test/`, including `bash -n` over `tools/orchestrator/*.sh`, so the `tools` CI job and `pnpm check:tools` fold into `check`. The shell scripts parse JSON with `node`. `ruff.toml`, `tools/tests/` and the uv/ruff/pytest steps are deleted; ARCHITECTURE rev 1.4 drops the C15 ruff C90 mention.
- Alternatives: Keep Python for the repo tools only (a second toolchain, uv on every machine and CI runner).
- Why: One language and one toolchain (Vite+) for the whole TypeScript project.
- Reversible: yes — tooling only.
- Owner answer: Owner decision, 2026-10-14.

### D-0019 — Node 26

- Date: 2026-10-14 · Spec/PR: tooling PR (#10) · Status: decided
- Decision: Node 26 everywhere: CI `setup-node` 26, `engines` `node >=26`, `@types/node` `^26`, and the Node 26 SEA sidecar (ARCHITECTURE rev 1.4: §3, §13, §16, A-4; SPEC-00, SPEC-01, SPEC-20).
- Alternatives: Stay on Node 24 LTS.
- Why: Node 26 becomes LTS in late October 2026, before the desktop release; it is installed on the build machine.
- Reversible: costly — the SEA sidecar and CI move together.
- Owner answer: Owner decision, 2026-10-14.

### D-0020 — Signed decimals parse

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: `parseQty`/`parseMoney` accept an optional leading `-`; `-0` parses to `0`. Rejecting qty <= 0 at creation stays in the API (C6).
- Alternatives: Reject any sign in the domain parsers.
- Why: `uninvoiced` may be negative (INV-05), so the formatters print negatives, and the INV-01 round-trip property needs parse to accept what format prints.
- Reversible: yes — one regex and its table rows.

### D-0021 — roundMoney tie rule

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: `roundMoney(m, 2 | 5)` rounds exact ties half away from zero in integer arithmetic (`848.755 -> 848.76`, `-848.755 -> -848.76`). This applies D-0009 (half-up) and fixes its meaning for negative amounts.
- Alternatives: Half-even; half toward +infinity for negatives.
- Why: The spec states no tie rule (SPEC-03 §9). SPEC-12 legacy goldens arbitrate, and a mismatch is escalated.
- Reversible: yes — one domain function and its table tests.

### D-0022 — Range

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: A decimal whose scaled integer exceeds `Number.MAX_SAFE_INTEGER` is a parse error, never a lossy number.
- Alternatives: `bigint` units.
- Why: C3 requires exact values; safe integers cover far more than any quantity or amount, and `number` keeps the columns and arithmetic simple.
- Reversible: costly — `bigint` would change every unit type.

### D-0023 — INV-02 example value

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: The tolerance example becomes `9.999` in INV-02, INV-62, ARCHITECTURE §6.11 (rev 1.3) and SPEC-02 §4.3. The old `9.9995` has four decimals, which a `Qty` cannot hold (INV-01), and `parseQty("9.9995")` is rejected (SPEC-02 §9). The rule is unchanged.
- Alternatives: Keep the text and treat 9.9995 as illustrative.
- Why: An example the types cannot express cannot be a literal test (C2).
- Reversible: yes — a doc edit.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0024 — PO header totals columns

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 2 (#8) · Status: decided
- Decision: `computePoTotals` returns `{ ordQty, dspQty, rcdQty, rejQty, balanceQty }` summed over active items; `balanceQty` is the sum of item balances, not `ord − max(rcd, dsp)` over the totals. No uninvoiced total.
- Alternatives: Also total `uninvoicedQty`; derive the header balance from the header totals.
- Why: The spec does not name the totals. The legacy PO list sums exactly these five per item (pending = sum of item balances), and the frozen PO list columns are Pending, Dispatched, Received, Accepted (= rcd, INV-09) and Rejected (C7).
- Reversible: yes — one domain function and its table.

### D-0025 — Cancelled item: only balance is zeroed

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 2 (#8) · Status: decided
- Decision: For a cancelled item, `computeItemQuantities` returns balance 0 and computes dsp and uninvoiced by the normal formulas; `computePoTotals` excludes the item from header totals.
- Alternatives: Zero every derived value of a cancelled item.
- Why: A-13 and INV-07 name only balance and header totals. Documents on a cancelled item stay visible and are flagged (`DOC_ON_CANCELLED_ITEM`, INV-56), so their dispatched and invoiced quantities should still show.
- Reversible: yes.

### D-0026 — Date winner from the input's SRV lines

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 3 (#9) · Status: decided
- Decision: `computeReceipt` takes the winner from the dates of the SRV lines in its input (`dateWinner(poDate, srvLines.map(srvDate))`). Which lines count (every SRV line on the PO item) is the caller's choice in SPEC-08 `recompute`, per the §4.2 shape.
- Alternatives: A separate PO-level SRV date list in `ReceiptInput`.
- Why: SPEC-02 §4.2 fixes the input shape with `srvDate` on each line; adding a field would change a shape other specs consume. ARCHITECTURE §6.3 takes `MAX(srv_date)` over the same rows it sums.
- Reversible: yes — one input field.

### D-0027 — Item status input shape

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 4 (#11) · Status: decided
- Decision: `itemStatus` takes `ItemStatusInput = { ordQty, dspQty, rcdQty, cancelled }`, the derived quantities from `computeItemQuantities` and `computeReceipt`, not their raw lines.
- Alternatives: Take `ItemQuantityInput` and recompute dsp inside `itemStatus`.
- Why: SPEC-02 §4.1 names `itemStatus(input)` without defining `input`; derived inputs keep the status rule (INV-62) independent of the quantity formulas and avoid computing dsp twice.
- Reversible: yes — one input type.

### D-0028 — poStatus takes item statuses including Cancelled

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 4 (#11) · Status: decided
- Decision: Callers pass every item's status to `poStatus`, which ignores `Cancelled`; no statuses, or all Cancelled, gives Closed (A2-13, EC-06).
- Alternatives: Callers filter to active items first.
- Why: INV-64 derives PO status over active items; filtering inside `poStatus` keeps that rule in one place instead of in every caller.
- Reversible: yes.

### D-0029 — Fy and docKey branded strings

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 1 (#12) · Status: decided
- Decision: `Fy` is a branded `"YYYY-YY"` string (`fyOf`); `docKey(number, fy)` returns a branded string `${fy}|${number.trim()}` used as a `Map` key. The FY prefix is fixed-width, so keys are unambiguous; DC, invoice and GC numbers each use their own key space (INV-23).
- Alternatives: Tuple or object keys (not usable as `Map` keys by value); a document-kind parameter in `docKey`.
- Why: SPEC-03 §4.1 fixes `docKey(number, fy)`, and `"2024-25"` is the legacy FY format. Trimming only surrounding whitespace follows legacy SRV linking (SPEC-03 §4.2, EC-16).
- Reversible: yes — a domain-internal representation.

### D-0030 — defaultGc blank GC number

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 1 (#12) · Status: decided
- Decision: `defaultGc` treats a GC number as blank when it is missing, `null`, empty or whitespace-only; a non-blank GC number is returned as typed, not trimmed. Only a missing or `null` GC date is blank (`IsoDate` cannot be whitespace).
- Alternatives: Trim the given GC number.
- Why: The spec is silent on storing the number; legacy GC defaulting checks `strip() == ""` and keeps a given value unchanged. Comparisons go through `docKey`, which trims.
- Reversible: yes.

### D-0031 — Sidecar packaging and port handoff

- Date: 2026-10-14 · Spec/PR: SPEC-01 PR 1 (#13) · Status: decided
- Decision: Ship the Node 26 SEA (`--build-sea`); `node.exe` + bundle stays only as the SPEC-20 build flag. The sidecar prints one `SENSTO_PORT=<port>` stdout line once startup has finished and writes no port file. The shell makes one `no-cors` request to `/api/health`, then navigates; the API gets no CORS header. The shell page spawns the sidecar with `Command.sidecar` (D-0008); window close ends it through the shell plugin's exit cleanup, and the sidecar exits on stdin EOF if the shell is killed. Single instance through the plugin's focus callback. Details: `docs/adr/0001-sidecar-packaging.md`.
- Alternatives: A port file; the fallback as default; a CORS header on `/api/health`; sidecar control in Rust (contradicts D-0008).
- Why: Measured in the spike (ADR 0001 Results). Both handoffs work but a file can be stale after a crash; the fallback is only 40–90 ms faster at the median on Node 26; a `no-cors` check keeps shell-specific headers out of the API.
- Reversible: yes — nothing is built yet; SPEC-20 implements it.

### D-0032 — Spike prototypes kept on a tag only

- Date: 2026-10-14 · Spec/PR: SPEC-01 PR 1 (#13) · Status: decided
- Decision: A spike merges only its record. Its prototype is an annotated tag `spike-<name>` (a dash, so it cannot clash with a branch name), linked from the record by tag and commit; no `spike/*` branch is pushed. This settles SPEC-01 §9's first open issue.
- Alternatives: A `spike/<name>` branch (SPEC-01 §2 wording); merging the prototype.
- Why: Keeps throwaway code off `main` and leaves no stale branch banner on GitHub (orchestrator). SPEC-01 §2 and §8 still say `spike/<name>`, and spike 3's tag is `spike/db`.
- Reversible: yes — a tag can be renamed.

### D-0033 — matchSrvItem / resolveDocLink signatures

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 4 (#16) · Status: decided
- Decision: `resolveDocLink(raw, srvDate, candidates)` takes candidates `{ id, number, date }` of one document kind and returns the linked id or `null`; a missing or whitespace-only number links nothing. `matchSrvItem({ materialCode, poItemNo }, poItems)` takes `poItemNo: number` and returns the matched PO item id or `null`.
- Alternatives: Return the matched object; a string PO item number; a precomputed `DocKey` index for candidates.
- Why: SPEC-03 §4.1 fixes names and arguments but not element types. `po_item_no` is part of `UNIQUE(po_id, po_item_no)` (ARCHITECTURE §8.2). Ids are what `resolved_dc_id` / `po_item_id` store. Callers can pre-filter candidates by number.
- Reversible: yes — domain-internal.

### D-0034 — Ambiguous material code is unmatched (EC-19)

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 4 (#16) · Status: decided
- Decision: When a material code is on several PO items and the SRV row's PO item number is none of them, the SRV line is stored unmatched (EC-19), as for EC-12.
- Alternatives: Pick the first item with the code.
- Why: A2-7 lets the PO item number decide among the items with that code; picking one would invent a rule (C18). To confirm against legacy ingestion goldens in SPEC-08.
- Reversible: yes.

### D-0035 — Material codes compared exactly

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 4 (#16) · Status: decided
- Decision: `matchSrvItem` compares material codes exactly: no trimming or case folding.
- Alternatives: Trim or upper-case before comparing.
- Why: Spec §3 matches by material code and states no normalisation; the parsers (SPEC-06) produce the stored values.
- Reversible: yes.

### D-0036 — GST percentage unit

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 (#15) · Status: decided
- Decision: GST percentages are a branded integer `GstPct` in 1e-5 units (`9` % -> `900000`), parsed exactly by `parsePct`; a negative rate is malformed input.
- Alternatives: Reuse `Money` for percentages; basis points.
- Why: SPEC-03 §9 names 1e-5 units; a separate brand stops a percentage being passed where an amount is expected.
- Reversible: yes — one type and its parser.

### D-0037 — Single rounding from the exact value

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 (#15) · Status: decided
- Decision: Taxable, CGST and SGST are each rounded once, from their exact bigint product, to 5 dp (GEMC) or 2 dp; CGST and SGST are computed from the rounded taxable, as INV-41 reads. No intermediate 5-dp rounding before a 2-dp one.
- Alternatives: Float arithmetic as legacy; round to 5 dp, then to 2 dp.
- Why: C3 forbids floats, and double rounding can move a tie. SPEC-12 invoice goldens arbitrate, as for D-0021.
- Reversible: yes — one function.

### D-0038 — Out-of-range amounts throw

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 (#15) · Status: decided
- Decision: `roundToMoney` throws `RangeError` when a result exceeds 2^53 1e-5 units (about 90 billion), instead of returning a lossy number.
- Alternatives: Return a `Result` from every tax function; `bigint` Money.
- Why: Follows D-0022 (never a lossy number). The case is unreachable with valid invoice input, so a `Result` would burden every caller.
- Reversible: yes.

### D-0039 — GEMC source-rate brand constructor

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 2 (#14) · Status: decided
- Decision: `gemcSourceRate(rate: Money)` is an explicit, unchecked brand applied where the GST-inclusive rate is read (BHEL page, manual GEMC entry, stored source column); `gemcNetRate` takes only a `GemcSourceRate` and returns plain `Money`, so its output cannot be divided again without an explicit re-brand (INV-17).
- Alternatives: A string-only `parseGemcSourceRate`.
- Why: The stored source column arrives as integer `Money`, not a string. SPEC-05/06/08 brand at their read boundary.
- Reversible: yes.

### D-0040 — GEMC number as captured

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 2 (#14) · Status: decided
- Decision: `extractGemcNumber` returns the captured group as written (case kept, `gemc-ab12` -> `ab12`), with no normalisation; a word between `GEMC` and the number is captured as the number (EC-18).
- Alternatives: Upper-case or otherwise normalise the number.
- Why: Legacy regex behaviour (A2-3, INV-19); the spec states no normalisation.
- Reversible: yes.

### D-0041 — DC-sourced invoice issue codes

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: `validateDcInvoiceLines` reports `line-not-on-dc`, `dc-line-missing` and `duplicate-line` besides SPEC-11 §4.3's `dc-qty-mismatch` and `rate-mismatch`, covering INV-29's "exactly the DC's lines"; qty and rate are compared exactly (integer units, no 0.001 tolerance).
- Alternatives: Reuse `line-not-on-po` for all three.
- Why: An exact copy of the DC has no rounding; a code per cause gives a plain reason. An empty invoice reports `dc-line-missing`; which code the API returns is settled in SPEC-11.
- Reversible: yes.

### D-0042 — A DC with no lines is rejected

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: DC and PO-direct invoice lines share one rule: at least one line (`no-lines`), each `qty > 0` on an item of the PO, no cap.
- Alternatives: Accept an empty DC.
- Why: An empty DC is malformed input (C6); SPEC-11 §4.3 lists `no-lines`. Unknown item ids stay the service's 404 (SPEC-11).
- Reversible: yes.

### D-0043 — deleteBlock shape and reasons

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: `deleteBlock(kind, links)` takes per-kind link counts (`dc: { invoices, srvItems }`, `invoice: { srvItems }`, `po: { dcs, invoices }`, `srv: {}`) and returns `dc-has-invoice`, `dc-linked-srv`, `invoice-linked-srv`, `po-has-dc`, `po-has-invoice` or `null`; the first listed reason wins.
- Alternatives: One `po-has-documents` reason.
- Why: A specific reason lets the UI show the plain sentence INV-35 asks for.
- Reversible: yes.

### D-0044 — changedImmutableFields paths

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: `changedImmutableFields` returns `lines.<id>.qty` and `lines.<id>.rate`, and `lines.<id>` for a line added or removed; any entry means the update is rejected (409).
- Alternatives: Compare qty and rate only, ignoring added or removed lines.
- Why: Adding or removing a line changes quantities, which INV-33 freezes.
- Reversible: yes.

### D-0045 — Flag shape and details

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 6 (#18) · Status: decided
- Decision: `DesiredFlag = { type, scopeType, scopeId, poId, details }`; `details = { field, expected, actual, docIds }` is stored as `details_json`, quantities as exact decimal strings. QTY_MISMATCH `ord_qty` (PO → SRV); DOC_NUMBER_CONFLICT `challan_no`/`invoice_no` (trimmed raw number, one flag per unresolved number); OVER_DISPATCH `dsp_qty` and OVER_INVOICE `invoiced_qty` against ord; DOC_ON_CANCELLED_ITEM `status` → `Cancelled`, one per DC/invoice line citing its document; MANUAL_ADJUSTMENT_OVERLAP `manual_dispatched_qty`, citing the later DCs once each, sorted.
- Alternatives: Integer `Qty` values in the JSON; `docIds` outside `details`; one DOC_NUMBER_CONFLICT per SRV line.
- Why: ARCHITECTURE §8.2 stores `details_json (field, expected, actual)`; the cited DC ids are needed to show which DC (SPEC-10/17), so they go in the same JSON.
- Reversible: yes, until SPEC-08 stores rows.

### D-0046 — Fingerprint encoding

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 6 (#18) · Status: decided
- Decision: `fingerprint` = `JSON.stringify([type, scopeType, scopeId, field, expected, actual, docIds])`, not hashed. `diffFlags` treats any stored fingerprint, open or acknowledged, as present and returns inserts with their fingerprint.
- Alternatives: A `|`-joined string (collides when a raw SRV number contains `|`); a SHA hash (crypto import in domain, C12).
- Why: §6.9 names the parts; JSON is unambiguous and readable. INV-59: re-detection never duplicates, whatever the stored flag's status.
- Reversible: yes, until SPEC-08 stores rows.

### D-0047 — Readings of the detection rules

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 6 (#18) · Status: decided
- Decision: QTY_MISMATCH needs a matched PO item (EC-12 lines are not compared); DOC_NUMBER_CONFLICT applies to unmatched lines too; a blank number cites nothing. MANUAL_ADJUSTMENT_OVERLAP uses a strict "after" over ISO-8601 UTC text (§8.1); manual > 0 with no `manualSetAt` raises nothing. OVER_DISPATCH / OVER_INVOICE apply to cancelled items too.
- Alternatives: Flag on a missing set time; exempt cancelled items.
- Why: The most literal reading of SPEC-03 §4.2 and ARCHITECTURE §6.9; the spec states no exemption (C2, C18).
- Reversible: yes.

### D-0048 — Mechanism for INV-64 CI check

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 5 (#19) · Status: decided
- Decision: `tools/checks/src/status-source.ts`, run in `check:code`, scans production `.ts`/`.tsx` line by line outside `packages/domain/src/status.ts`. It fails on a function named for item or PO status, and on a status literal produced by `return`, `=>`, `?`/`??`/`&&`/`||`, an assignment (JS or SQL `SET`, spaces around `=`) or SQL `THEN`/`ELSE`. Comparisons, SQL `WHERE`/`AND`/`OR`/`ON`/`HAVING` filters, JSX attributes, `case` labels, arrays and maps pass.
- Alternatives: An Oxlint rule (its built-in rules can't express "only in file X"); an AST walker (heavier, not needed yet); matching any `*status*` name (false positives on job, reconciliation and HTTP status).
- Why: The simplest check that catches a second implementation while leaving consumers free to filter and display status (INV-64, INV-65). Multi-line declarations and statuses built from imported constants can evade it; review covers those (C2). A SQL `WHERE` on its own line before `status = '…'` is flagged; keep the keyword and the comparison on one line.
- Reversible: yes.

### D-0049 — Status value list is literal in the check

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 5 (#19) · Status: decided
- Decision: The check spells out `Pending|Delivered|Closed|Cancelled` instead of importing a runtime list from `packages/domain`.
- Alternatives: Export the status values from `status.ts` and build the pattern from them.
- Why: It keeps the row out of the domain's public API; the domain union changes only through an owner decision, and then the check's pattern needs the same edit.
- Reversible: yes.

### D-0050 — Wire codecs via z.codec

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 1 (#20) · Status: decided
- Decision: `zQty`, `zMoney` and `zIsoDate` are Zod 4 codecs over the domain's parse/format functions; the output side checks the value (`Number.isSafeInteger`, or a valid date), so encoding a float or a bad date throws.
- Alternatives: `z.string().transform(...)` (cannot encode responses); `z.custom` on the branded type (no wire string type).
- Why: One schema serves request decoding and response encoding (C3), with no second parser.
- Reversible: yes — internal to `packages/schemas`.

### D-0051 — Ids are plain ULID strings

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 1 (#20) · Status: decided
- Decision: `zId = z.ulid()`, unbranded, matching the domain's `string` ids (D-0033).
- Alternatives: Per-entity branded ids.
- Why: The most conservative reading; the domain has no id brands. SPEC-04 PR 2 can add brands if entities need them.
- Reversible: yes.

### D-0052 — C12 lint rule matches exact names

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 1 (#20) · Status: decided
- Decision: Bare builtins and `playwright`/`playwright-core` go in `no-restricted-imports.paths`; the patterns keep only the prefixes `node:*`, `playwright/*`, `playwright-core/*`, `@playwright/*` and `@tauri-apps/*`.
- Alternatives: Anchored gitignore patterns (not known to behave the same in Oxlint).
- Why: The builtin `domain` as a pattern blocked `@senstosales/domain` in every core package. Regression test in `lint-boundaries.test.ts`.
- Reversible: yes.

### D-0053 — Legacy display formats kept per screen

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: Each distinct legacy display format is one named shared formatter: `fmtDate` (`05/01/2025`, empty `—`), `fmtDateMonthName` (`05 Jan 2025`, empty `-`; PO delivery dates and deviations), `fmtMoney` (full precision, `-₹848.75`), `fmtMoneyCompact` (`₹1.50L`, `₹1.00Cr`; rounded to whole rupees first), `fmtMoneyCompactSpaced` (`- ₹1.50 L`; delivery tracker, rounds the magnitude and only below a lakh), `fmtRate` (no rupee sign; legacy rate cells draw it apart), `fmtFy` (`FY 2024-25`).
- Alternatives: One format per kind of value.
- Why: SPEC-04 §9: where legacy shows two formats for the same kind of value, each screen keeps its own; unifying them needs an ADR (C7).
- Reversible: yes.

### D-0054 — Quantities display in whole units

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: `fmtQty` rounds to whole units half toward +infinity, as legacy does for every quantity cell and total (`2.5 -> 3`, `-2.5 -> -2`). Recorded as EC-21.
- Alternatives: Show up to 3 dp.
- Why: SPEC-04 §4.4 asks for legacy-identical output; showing decimals would be new behaviour (C18).
- Reversible: yes.

### D-0055 — No negative zero

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: An amount or quantity that rounds to zero prints unsigned (`0`, `₹0`); legacy printed `-0`, `-₹0` or `- ₹0` for small negatives such as `-0.4`.
- Alternatives: Reproduce the sign.
- Why: The sign is a float artefact of the legacy code, not a format.
- Reversible: yes.

### D-0056 — Exact ties in display rounding

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: `fmtMoney`/`fmtRate` round to 2 dp through the domain `roundMoney`, half away from zero (D-0021): `848.755 -> ₹848.76` (legacy `toFixed` on the binary float shows `₹848.75`). The compact formats round hundredths of a lakh or crore half up on the exact value; whole rupees and whole units round half toward +infinity, as legacy `Math.round` does.
- Alternatives: Emulate the float rounding.
- Why: Stored amounts are exact (C3), so the display must not depend on binary floats; ties arise only for values with more decimals than shown, which the write paths already round.
- Reversible: yes.

### D-0057 — C12 lint: deep subpath globs

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: The C12 prefix globs use `**` (`node:*`, `node:*/**`, `playwright/**`, `playwright-core/**`, `@playwright/**`, `@tauri-apps/**`), so subpaths at any depth are banned. Extends D-0052.
- Alternatives: Keep single-level `*`.
- Why: A gitignore-style `*` does not cross `/`, so `node:fs/promises` and `@tauri-apps/api/core` passed the ban. Regression test in `lint-boundaries.test.ts`.
- Reversible: yes.

### D-0058 — Db wraps a Drizzle async SQLite database

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 1 (#22) · Status: decided
- Decision: `Db` is `build` (Drizzle's builders, `transaction` and `batch` removed from the type), `query(statement)` for one read and `batch(statements)` for Drizzle batch items, all or nothing; both map failures to `DbError`. `wrapDrizzle` in `port.ts` builds it for every executor.
- Alternatives: A Drizzle-free `{ sql, params }` statement port (loses typed row mapping and the PR 2 customTypes); exposing the Drizzle db (its `transaction()` is forbidden by ADR 0002).
- Why: ADR 0002 (D-0017) says the port wraps Drizzle; one wrapper keeps node and D1 semantics identical.
- Reversible: yes.

### D-0059 — UniqueViolation carries the SQLite constraint target

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 1 (#22) · Status: decided
- Decision: `UniqueViolation.target` is the target SQLite reports (`table.column, …`), not an index name.
- Alternatives: Look up the index name in `sqlite_schema` on each violation.
- Why: SQLite and D1 messages name the columns, not the index; the target is still unique per index, so services can map it to a plain 409 (SPEC-05 §4.3).
- Reversible: yes.

### D-0060 — Empty batch is a no-op; second commit throws

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 1 (#22) · Status: decided
- Decision: An empty `batch` or `WriteBatch.commit()` writes nothing and succeeds; a second `commit()`, or `add()` after a commit, throws.
- Alternatives: Reject an empty batch.
- Why: An empty batch has nothing to make atomic; committing twice would split one use case's writes (C4).
- Reversible: yes.

### D-0061 — Entity shapes are API read shapes of the §8.2 rows

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: Entities use camelCase column names with the unit suffix dropped (`ord_qty_m` -> `ordQty`; the codec carries the unit). `supplier_id` (one supplier per install, A2-12) and `reconciliation_issue.fingerprint` (storage only) are left out; JSON columns become named fields (`bankDetails`, `rawHeader`, `details`, `before`/`after`, `progress`, `summary`).
- Alternatives: Mirror the columns 1:1.
- Why: The API never needs those two columns, and the domain already uses these field names.
- Reversible: yes.

### D-0062 — DC and invoice header fields come from the legacy forms

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: DC: ourRef, departmentNo, consignee name/GSTIN/address, inspectionCompany, ewayBillNo, vehicleNo, lrNo, transporter, modeOfTransport, remarks, plus the supplier snapshot. Invoice: the buyer snapshot (name, GSTIN, address, state, state code, place of supply, buyer's order date), gemcNumber/gemcDate, paymentTerms, despatchDocNo, srvNo/srvDate, vehicleNo, lrNo, transporter, destination, termsOfDelivery, remarks, plus the supplier snapshot. Dropped: legacy multi-PO `po_numbers` (A-16), `source_type` (now `kind`), `mode_of_payment` (a fallback alias of payment terms) and stored list totals.
- Alternatives: A minimal header set now, with fields added as screens need them.
- Why: ARCHITECTURE §8.2 says only "header fields" and SPEC-11 §9 points to the legacy edit dialogs; these are the fields those forms show (C7 freezes the visible elements).
- Reversible: yes, until SPEC-05 PR 2 creates the columns.

### D-0063 — Per-endpoint bodies are built in PR 3

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: SPEC-04 PR 2 ships the entities, the header shapes and the common list, paged and error shapes; PR 3 builds each route's request and response from them (`pick`/`extend`) next to its table entry.
- Alternatives: Define every request body in PR 2.
- Why: The PR-plan row lists exactly "list query, paged, error body" for `api/*.ts`, and each body sits more naturally beside its route.
- Reversible: yes.

### D-0064 — List query conventions

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: `pageSize` must be 10, 25, 50 or 100 (default 10); `page` >= 1 (default 1); `sort` is optional and checked against the list's allowlist; `dir` is `asc|desc` (default `asc`); unknown query keys are stripped.
- Alternatives: Any page size up to a cap; reject unknown keys.
- Why: Legacy behaviour (the pager's options and its default of 10); SPEC-10 §4.2 requires an unknown sort column to be a 400.
- Reversible: yes.

### D-0065 — Error body is strict

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: `zErrorBody` is `z.strictObject({ code, message, details?: record })`; `code` is any non-empty string.
- Alternatives: An enum of codes.
- Why: The codes are defined by the API specs (`delete-blocked`, the domain issue codes and so on), so the body shape is fixed here and the codes are set there.
- Reversible: yes.

### D-0066 — Job event level and text codes

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: `job_event.level` is `info | warn | error`; `departmentNo` and `destCode` are strings (legacy stored integers).
- Alternatives: Free-text level; integer codes.
- Why: The three levels match the pino levels the API logs with; codes are identifiers, not numbers, so text keeps any leading zeros.
- Reversible: yes.

### D-0067 — `supplier_id` on every business table

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: `supplier_id` (NOT NULL, FK to `supplier`) is on every business table, child tables included: settings, secret, buyer, source_document, po, po_item, po_lot, dc, dc_item, invoice, invoice_item, srv, srv_item, reconciliation_issue. It is not on supplier, app_user, session, audit_log, job, job_event or schema_migration.
- Alternatives: Only on top-level documents; on every table.
- Why: ARCHITECTURE §8 says "every business table"; the literal reading is the conservative one. Auth, audit, jobs and migrations are install-level.
- Reversible: yes, before 0001 ships.

### D-0068 — Foreign keys only on ownership edges

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Foreign keys only on child → parent document, `session.user_id`, `job_event.job_id` and `supplier_id`. No FKs on matched or resolved links (`srv.po_id`, `srv_item.po_item_id`, `resolved_dc_id`, `resolved_invoice_id`, the flag's `scope_id`/`po_id`, `po.buyer_id`, the `job_id` on audit_log and source_document). No `ON DELETE` actions.
- Alternatives: FKs on every id column; none.
- Why: Links are recomputed by service batches (§6.10), and their delete rules belong to services (`deleteBlock`, INV-35). An FK would turn a PO or buyer delete into a raw DbError.
- Reversible: yes, before 0001 ships.

### D-0069 — Extra customTypes `pctU5` and `fy`

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Besides the five SPEC-05 §4.1 customTypes, `pctU5` maps `cgst_pct_u5`/`sgst_pct_u5` to `GstPct` and `fy` maps `financial_year` to `Fy`. `ulid` stays an unbranded `string`. `Instant` is a brand in `packages/db/src/types.ts`.
- Alternatives: GST percentages in a `moneyU5` column; branded ids.
- Why: GstPct is 1e-5 units but not money, and FY values come only from `fyOf`. Ids arrive from the API as plain strings (`zId`), so branding them would add casts with no check behind them.
- Reversible: yes.

### D-0070 — Integer-unit columns refuse non-integers

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Integer-unit columns throw `DbError("Not an integer unit: …")` for a non-safe-integer, on write and on read. Text brands are not re-validated.
- Alternatives: No check; a SQL `CHECK (typeof(x) = 'integer')`.
- Why: C3 forbids floats in columns, and SQLite INTEGER affinity silently stores 2.5 as REAL. Text values were validated where they entered.
- Reversible: yes.

### D-0071 — Nullable SRV item quantities

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: `srv_item.rcd_qty_m`, `accepted_qty_m` and `rej_qty_m` are nullable; `ord_qty_m` is NOT NULL.
- Alternatives: NOT NULL, as `zSrvItem` declares.
- Why: The domain's `SrvLine` reads them as `Qty | null` and falls back from rcd to accepted (INV-11), so storage keeps what the page lacks. SPEC-10's read mapping can normalise.
- Reversible: yes.

### D-0072 — Derived columns have no default

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Derived columns (`status` and the `*_qty_m` totals on po and po_item) are NOT NULL with no default. Only `manual_dispatched_qty_m` (0), `version` (1) and `job.cancel_requested` (false) have defaults.
- Alternatives: Default 0 / `Pending`.
- Why: A default would let an insert skip the recompute, and `balance_qty_m` has no correct default.
- Reversible: yes.

### D-0073 — `app_user` and `session` columns

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: `app_user`: `username` (unique), `password_hash`, `password_changed_at` (nullable). `session`: `user_id`, `token_hash` (unique), `created_at`, `expires_at`.
- Alternatives: Decide in SPEC-07 via migration 0002.
- Why: EC-08's reset rule needs to know whether the password was changed, and remember-me needs an expiry. These are the smallest columns that support both.
- Reversible: yes, before 0001 ships.

### D-0074 — Enum TEXT columns typed in TypeScript only

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Enum-valued TEXT columns are typed in TypeScript only (domain `ItemStatus`, `PoStatus`, `FlagType`, `FlagScope`; schemas `zJobType`/`zJobStatus`/`zFlagStatus`/`zInvoiceKind`), with no SQL CHECK.
- Alternatives: A CHECK per enum.
- Why: Adding a value later would need the table-rebuild pattern, and every writer is already typed.
- Reversible: yes.

### D-0075 — Parser document shapes

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: `PoDocument`/`SrvDocument` are strict Zod objects over the wire codecs, and a fixture's expected JSON is the encoded form. Header fields not on the page are `null`; `amendNo` is a non-negative integer; `destCode`, `division` and `poStatusCode` are text. `rejQty` (PO) and `ordQty`/`acceptedQty` (SRV) are `null` when the page has no such column. PO `rawHeader` is label as printed -> cleaned cell text for every header label the parser reads; SRV `rawHeader` is column header -> the SRV's first row text. A PO needs at least one item; an SRV file (`zSrvFile`) holds at least one SRV, all of one PO.
- Alternatives: Plain domain values in the JSON; empty strings for absent fields; codes as integers (legacy).
- Why: SPEC-06 §4.2 names the fields but not absence or `rawHeader` keys; null for absent text is the most conservative reading, and text codes keep leading zeros.
- Reversible: yes — edit the types and the expected JSON.

### D-0076 — First fixtures are synthetic, modelled on the legacy labels

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: The first 5 PO and 5 SRV fixtures are hand-written with invented values, using the header labels and column headers the legacy parser reads. Assumed PO eras: era 1 has label|value cells, `DD/MM/YYYY` and no REJ QTY column; era 2 has labels above values, `DD-MON-YY`, REJ QTY and descriptions keyed by item number. Assumed SRV layouts: A (`SRV NO`, `RECVD QTY`, `ACPT QTY`, …) and B (`SRV NUMBER`, `RECEIVED QTY`, no ordered or accepted column).
- Alternatives: Wait for H4 and anonymise real pages.
- Why: No corpus access (H4) and no real pages in the repo (C1). PR 5 (anonymised pages) and PR 6 (corpus test) check the real era and layout differences.
- Reversible: yes — PR 5 can replace or extend the fixtures.

### D-0077 — Anonymiser replacement rules

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: Kept: entities; real calendar dates in the three page formats; decimal (no leading zero, at most 5 places) and comma-grouped numbers, each only as a whole run; a fixed label, unit and month vocabulary; layout attributes, the `<meta http-equiv>` tag and `<style>` bodies. Everything else (every bare integer, every run of letters, marks and digits in any script, comment text, `id`/`name`/`content`/`href`/`value`/`title` values) is replaced by a same-shape random token through the mapping, never the original, a label word, GSTIN- or mobile-shaped, and avoiding values already mapped. Script bodies are dropped. Paths are compared after resolving symlinks: page under `SENSTO_CORPUS_DIR`, mapping outside the repo.
- Alternatives: Keep short whole-cell integers; column-aware classification.
- Why: C1 forbids real DC and invoice numbers, which are short integers on SRV pages; INV-75 keeps quantities, which BHEL prints with decimals. Where they conflict, privacy wins; the mapping keeps item and lot numbers consistent across a PO and its SRV file.
- Reversible: yes — local tool.

### D-0078 — Initial ParseError codes

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: `ParseError.code` is `no-item-table | no-srv-table | bad-date | bad-quantity | duplicate-srv-item-key` (the codes SPEC-06 §4.4 names); later PRs extend the union.
- Alternatives: An open string code.
- Why: Stable codes for `job_event` (SPEC-08).
- Reversible: yes.

### D-0079 — Parser fixture pages are data: not formatted, not analysed by Sonar

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: `vp fmt` ignores `packages/parsers/fixtures/**/*.html`, and `.sonarcloud.properties` excludes `packages/parsers/fixtures/**` from SonarCloud analysis.
- Alternatives: Pretty-printed fixtures; rewriting pages as modern HTML (doctype, `lang`, `<th>`, no `width`/`cellpadding`) to pass Sonar's Web rules and 3% duplication gate.
- Why: Fixtures stand in for BHEL pages and must keep the legacy markup the parser meets; the formatter re-laid every cell, Sonar flagged the legacy attributes, and fixtures repeat by nature. Like the lockfile they are data; all code stays analysed.
- Reversible: yes — delete the ignore pattern and the properties file.

### D-0080 — PO header label cells match the whole cell text

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: A label is found only when the whole cleaned cell text matches its anchored pattern; inline `LABEL: value` cells are not read.
- Alternatives: The legacy substring search with a filter on "DETAILS" values.
- Why: Whole-cell matching cannot pick up headings like "PURCHASE ORDER DETAILS" and needs no filters; all fixtures match. The PR 6 corpus test will show if any page needs more.
- Reversible: yes — widen the patterns.

### D-0081 — Label value orientation from the parser's label vocabulary

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: The value is the cell to the right unless that cell is itself a known label, then the cell below; a label with an empty value yields "" and a later occurrence with a value wins.
- Alternatives: The legacy per-field "below/adjacent/any" preference with an uppercase "label-like" heuristic.
- Why: The heuristic treats uppercase values such as `INR` as labels and drops them; the parser's own vocabulary is exact.
- Reversible: yes.

### D-0082 — Page date formats and two-digit years

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: Only the spec's three formats (one- or two-digit day and month accepted, month names case-insensitive); a two-digit year is 20YY.
- Alternatives: A century pivot; accepting ISO or DD-MM-YYYY too.
- Why: SPEC-06 §2 and §9 (legacy `normalize_date` read all two-digit years as 20YY).
- Reversible: yes.

### D-0083 — New ParseError codes and header number reading

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: `missing-field`, `bad-po-number` and `bad-number` added (SPEC-06 §4.4 lists codes with "…"); header amounts have comma grouping removed before the domain's `parseMoney`; an empty AMEND NO is 0.
- Alternatives: Reuse `bad-quantity` for amounts; fail on an empty AMEND NO.
- Why: Stable, specific codes for the ingest job event; comma stripping and the 0 default match the legacy parser (`safe_to_int`).
- Reversible: yes.

### D-0084 — Schema version source

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: The schema version is `max(version)` in `schema_migration` on every build; `PRAGMA user_version` is neither written nor read. Supersedes D-0017's `user_version` wording. ARCHITECTURE §8.2/§13.3 (revision 1.5), SPEC-05, SPEC-07 (calls `readSchemaVersion`), INV-82 and ADR 0002 updated. The owner delegated this decision to the orchestrator.
- Alternatives: Mirror the version into `user_version` on the node build, as D-0017 said.
- Why: One version source that works on both executors; D1 refuses `PRAGMA user_version` (ADR 0002).
- Reversible: yes, before SPEC-07 ships.

### D-0085 — `checkVersion` folded into `planMigrations`

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: `planMigrations` throws `NewerDatabaseError` ("This data was saved by a newer version of SenstoSales."), so no caller can plan without the check.
- Alternatives: A separate `checkVersion`, as the SPEC-05 §4.1 table listed.
- Why: One call; the check cannot be skipped.
- Reversible: yes.

### D-0086 — Migrations numbered from 1

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: drizzle-kit's `0000` is renamed `0001_init.sql` and its journal edited to `idx: 1`, so the next is `0002`; the meta snapshot is committed.
- Alternatives: Keep drizzle-kit's 0-based numbering.
- Why: The spec names `0001_init.sql`, and version 0 means an empty DB.
- Reversible: yes.

### D-0087 — Migration stamp values from the caller

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: `applyMigrations` takes `{ appVersion, appliedAt }` from its caller.
- Alternatives: Read the clock and app version inside the migrator.
- Why: The Clock port and the VERSION file belong to SPEC-07.
- Reversible: yes.

### D-0088 — Generated files not formatted

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: `**/*.generated.ts` is in the Oxfmt `ignorePatterns`; the generator's freshness test is its check.
- Alternatives: Format the output in the generator.
- Why: One source of truth for the file's content.
- Reversible: yes.

### D-0089 — Snapshot harness deferred to migration 0002

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: The previous-version snapshot harness waits for `0002` (SPEC-05: "first used by 0002"); `planMigrations` already takes a migration list for it.
- Alternatives: Build it now with nothing to exercise.
- Why: No speculative code.
- Reversible: yes.

### D-0090 — GEMC number filled from the header

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: `gemcNumber` is set in `parsePoHeader` from REMARKS rather than in PR 3.
- Alternatives: Leave it to PR 3's `parsePo`.
- Why: It depends only on a header field, so fixture headers match their expected JSON whole.
- Reversible: yes.

### D-0091 — Route table and API shapes by resource

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: The route table is `src/routes.ts`; request and response shapes are in `src/api/<resource>.ts`, following SPEC-04's module table.
- Alternatives: Shapes beside each table entry (D-0063).
- Why: One file per resource keeps `routes.ts` under 800 lines (C15).
- Reversible: yes.

### D-0092 — Onboarding routes are public

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `onboarding.status` and `onboarding.complete` need no session; the API answers them only while no supplier exists (INV-78).
- Alternatives: Require a session.
- Why: Onboarding runs before the first login (ARCHITECTURE §10.3).
- Reversible: yes.

### D-0093 — Settings body

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Settings are `{ cgstPct, sgstPct, preferences }`.
- Alternatives: Separate routes per setting.
- Why: One body for the one settings form.
- Reversible: yes.

### D-0094 — Login takes no username

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: The login body is `{ password, rememberMe }`.
- Alternatives: Send the username `admin`.
- Why: The username is fixed (A-17, C11).
- Reversible: yes.

### D-0095 — No set-default buyer route

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Buyers have list, create, update and delete only.
- Alternatives: A set-default route.
- Why: The ARCHITECTURE §8.2 buyer has no default column.
- Reversible: yes.

### D-0096 — Stats take the list filters

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: PO, DC, invoice, SRV and tracker stats take the same filters as their lists.
- Alternatives: Unfiltered totals.
- Why: The legacy KPI cards show totals of the filtered list.
- Reversible: yes.

### D-0097 — DC and invoice number checks

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `dc.numberCheck` and `invoice.numberCheck` answer whether a `(number, FY)` is taken.
- Alternatives: Report the collision only on save.
- Why: The legacy form checks live; the flow is frozen (C7).
- Reversible: yes.

### D-0098 — Header edits carry no lines; edit bodies include number and date

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: DC and invoice update bodies hold header fields only, including the number and the date.
- Alternatives: Edit lines in the same body; fix the number and date at creation.
- Why: INV-33 holds by construction; INV-25 and INV-37 allow editing the number and date.
- Reversible: yes.

### D-0099 — Linked documents route

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `po.linked` returns a PO's DCs, invoices and SRVs for popovers and search previews.
- Alternatives: Embed them in every list row.
- Why: Popovers load on demand (INV-73).
- Reversible: yes.

### D-0100 — Reports routes

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Reports are the pending and reconciliation tabs; the PO, DC and invoice registers are export-only. Export-selected takes `poIds`, and exports the selected POs' reconciliation rows (SPEC-13 §2).
- Alternatives: Register list endpoints; export by PO item ids.
- Why: The legacy UI shows the registers only as downloads; SPEC-13 §2 names the selected POs.
- Reversible: yes.

### D-0101 — Delivery tracker returns days to due

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Tracker rows carry `daysToDue`; the UI derives the label.
- Alternatives: A status string from the API.
- Why: The API sends values; the UI formats what it shows.
- Reversible: yes.

### D-0102 — Dashboard lead time in whole days

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `avgLeadTimeDays` is an integer number of days.
- Alternatives: A fractional day count.
- Why: No floats on the wire (C3).
- Reversible: yes.

### D-0103 — BHEL wizard step union

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: BHEL session responses are a union on `step`: `otp`, `captcha` (with a new image) or `ready`.
- Alternatives: One object with optional fields.
- Why: Each step's required fields are enforced by the schema.
- Reversible: yes.

### D-0104 — Jobs keyed by staging and session ids

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Job bodies name a `stagingId` or `sessionId`, never a file path.
- Alternatives: Pass paths.
- Why: File locations come from the Storage port (C17).
- Reversible: yes.

### D-0105 — Downloads are files

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Download routes declare `response: "file"`; the client returns `{ fileName, bytes }`, and the name comes from `Content-Disposition`.
- Alternatives: A JSON-wrapped download.
- Why: Excel and CSV names stay as legacy (SPEC-12).
- Reversible: yes.

### D-0106 — Query arrays as repeated keys

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: An array in a query is sent as repeated keys (`types=po&types=dc`).
- Alternatives: Comma-joined values.
- Why: Standard URL encoding; no separator escaping.
- Reversible: yes.

### D-0107 — Fields with no ARCHITECTURE §8.2 column left out of the API shapes

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: These legacy fields are not in any API shape: the supplier description/tagline; the invoice item HSN; the SRV item description, rate, unit, revision and challan qty; the pending report's "no. of packets"; the audit category list. The spec that first needs a field adds its column.
- Alternatives: Add the fields to the shapes now, with no column behind them.
- Why: Shapes follow the schema; there is nothing to store or return yet.
- Reversible: yes.

### D-0108 — SRV header vocabulary and row selection

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 4 (#29) · Status: decided
- Decision: Columns are matched by whole header text, case-insensitively, using the legacy alias list (`PO NO`/`PO NUMBER`/`PURCHASE ORDER`, `SRV DATE`/`DATE`/`RECEIPT DATE`, `LOT NO`/`LOT`, `RECVD`/`RECEIVED`/`RECD QTY`, `CHL DT`, `TAX INV`, …). Every table whose first row has `SRV NO`/`SRV NUMBER` is read. Rows with fewer than 5 cells, or whose SRV number has no digit (totals, notes), are skipped, as legacy did.
- Alternatives: Read only the first SRV table; substring header matching.
- Why: Matches the legacy parser's extraction (SPEC-06 §7); whole-cell matching follows D-0080.
- Reversible: yes.

### D-0109 — SRV empty cells and malformed values

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 4 (#29) · Status: decided
- Decision: An empty received or rejected cell is 0; an empty ordered or accepted cell is null. Comma grouping is removed. A negative or non-numeric quantity is `bad-quantity` (EC-22). An empty PO number, SRV date or item key is `missing-field`. An item key that is not a positive integer is `bad-number`. A bad SRV, challan or invoice date is `bad-date`; an empty challan or invoice date is null. The SRV date and `rawHeader` come from the SRV's first row.
- Alternatives: Legacy's strip-every-non-digit reading (`-1` → 1, `N/A` → 0); null received or rejected quantities.
- Why: SPEC-06 §4.4 makes malformed input a typed failure, consistent with D-0083; the non-null `rcdQty`/`rejQty` follow D-0075 and legacy ingestion's 0 default.
- Reversible: yes.

### D-0110 — `mixed-po-numbers` ParseError code

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 4 (#29) · Status: decided
- Decision: An SRV file with rows of more than one PO fails with `mixed-po-numbers`, located at the first row that differs. Rows are grouped by SRV number within that one PO, which equals grouping by `(po_number, srv_number)`.
- Alternatives: Return SRVs of several POs; drop the differing rows.
- Why: SPEC-06 §4.1 and `zSrvFile`: one file holds the SRVs of one PO.
- Reversible: yes.

### D-0111 — PO item cells: what is required, what defaults

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: The item table must have PO ITM, MATERIAL CODE, UNIT, PO RATE, ORD QTY and RCD QTY columns, else `missing-field` at the column header. An item row needs a material code, rate and ordered quantity. An empty RCD QTY or REJ QTY cell is 0 (legacy `safe_to_float`); `rejQty` is null when the table has no REJ QTY column. A lot needs a whole LOT NO above 0 and a DELY QTY. DELY DATE is a page date or empty (null). DEST CODE is text or null. Malformed cells fail the file (`bad-quantity`, `bad-number`, `bad-date`) rather than being defaulted.
- Alternatives: The legacy parser's silent defaults (0, lot 1, skipping the row) for every bad cell.
- Why: SPEC-06 §4.4 gives stable error codes, and the §6 corpus test asserts that every date parses, so failing loudly is the conservative reading. Empty received and rejected cells keep the legacy 0 because they are common on unreceived items.
- Reversible: yes. Relax the checks if the PR 6 corpus test shows real pages need it.

### D-0112 — No synthetic lot for an item without lot rows

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: An item whose page shows no lot gets `lots: []`. The legacy default lot (lot 1, delivery quantity = ordered quantity, no dates, dest 0) and its spreading of received and rejected quantities across lots are not ported.
- Alternatives: Port the default lot.
- Why: A document carries only what the page says (INV-49), and lots are planning only with no distribution (ARCHITECTURE §6.2, INV-06).
- Reversible: yes.

### D-0113 — Drawing-number pattern without backtracking

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: The prefix after `DRG`/`DRAWING` is matched with no overlapping quantifiers: `[ .-]*`, then optionally `NO[.-]*\s*`, then optionally `:\s*`. The legacy lookahead `(?=\s|ITEM|VAR|REV|,|$)` is applied in code to the greedy run of number characters. Matches of 5 or more characters are kept, distinct, in code-unit order, joined by `, `.
- Alternatives: The legacy regex as it was, which SonarCloud flags as super-linear (S8786).
- Why: The output matches the legacy pattern for drawing numbers of 5 or more characters, except in odd separator orders such as `DRG NO : 123` (now read, where legacy read nothing).
- Reversible: yes.

### D-0114 — Shared parse-result helpers in `src/fields.ts`

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: `fail`, `readQty` and `readMoney` (comma grouping removed) live in one module of `packages/parsers`. The PO header and items use it, and it is open to the SRV parser.
- Alternatives: A copy in each parser module.
- Why: One rule for how page numbers are read and how failures are reported.
- Reversible: yes.

### D-0115 — OpenAPI freshness checked by a test, not a ci.yml step

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `tools/gen/test/openapi.test.ts` compares the committed `openapi.json` with the generator's output; it runs in `check:code`, so in the CI `check` job.
- Alternatives: A ci.yml step running `regenerate && git diff --exit-code` (SPEC-04 §6 wording).
- Why: A separate step breaks the CI-parity test (one check script per CI job, mirrored by `pnpm verify`); chaining it into `check:code` would rewrite a tracked file and depend on index state; the migrations generator already uses a test.
- Reversible: yes.

### D-0116 — OpenAPI security is a cookie named `session`

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `components.securitySchemes.session` is an `apiKey` in a cookie named `session`; routes are secured globally and public routes set `security: []`.
- Alternatives: An `x-` extension without a cookie name.
- Why: OpenAPI needs a cookie name and no spec gives one; SPEC-07 can rename it and regenerate.
- Reversible: yes.

### D-0117 — Downloads documented as `application/octet-stream`

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `response: "file"` routes declare a 200 response with `application/octet-stream`, named by `Content-Disposition`.
- Alternatives: List the xlsx and csv media types per route.
- Why: The route table does not say which format each download is (D-0105).
- Reversible: yes.

### D-0118 — OpenAPI builder on a subpath export

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `buildOpenApi` is imported from `@senstosales/schemas/openapi`, not from the package index.
- Alternatives: Export it from the index.
- Why: Its module-level registry would keep zod's JSON Schema converter in the web bundle.
- Reversible: yes.

### D-0119 — D1 executor builds the batch itself

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: `openD1Db` renders each statement with `SQLiteAsyncDialect.sqlToQuery(statement.getSQL())` and sends one `binding.batch()`; Drizzle's own D1 batch is not used.
- Alternatives: Drizzle's `db.batch`; a pnpm patch to drizzle-orm's `d1/session.js`.
- Why: drizzle-orm 0.45.4's D1 batch throws on a raw `run(sql)` with parameters (it binds a statement it never prepared). The port's batch returns no rows, so nothing is lost; a patch would be carried across upgrades. Covered by `packages/db/test/d1.test.ts`.
- Reversible: yes.

### D-0120 — `wrapDrizzle` takes `runBatch`

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: Each executor passes its native batch to `wrapDrizzle(drizzleDb, runBatch)`; the port keeps the empty-batch no-op and the error mapping. `Statement` is `BatchItem<"sqlite"> & SQLWrapper`.
- Alternatives: A `BatchingDatabase` type that assumes Drizzle's batch works on every driver.
- Why: The smallest seam that lets D1 use its own batch (D-0119).
- Reversible: yes.

### D-0121 — Local D1 is miniflare in-memory

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: The D1 tests and dialect step use `miniflare` 4.20260730.0 (MIT), a dev dependency of `tools/checks` and `packages/db`. The override `miniflare>sharp: "-"` removes sharp (loaded lazily, only for the Images binding) and its LGPL libvips packages (C13); workerd's install script is not run.
- Alternatives: `wrangler d1 execute --local` with a config file and a persisted directory, as in the spike (pulls in sharp the same way).
- Why: No account, config file or persisted state, and it runs the real migrator and D1 executor.
- Reversible: yes.

### D-0122 — D1 dialect step inside `check:code`

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: The migration SQL lint and the D1 dialect step run in the `check:code` script (CI `check` job), not a new job.
- Alternatives: A separate `d1-dialect` CI job.
- Why: No new required check for the ruleset (H1), and `pnpm verify` stays the sum of the jobs.
- Reversible: yes.

### D-0123 — Migration SQL lint scope

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: Beyond the §8.3 allowlist the lint refuses every `PRAGMA` (including drizzle-kit's `foreign_keys=OFF/ON` around rebuilds), `DROP TABLE` outside a rebuild, a `RENAME` other than `__new_x` → `x` or before its `DROP`, a rebuild left unrenamed, and more than one statement between breakpoints (a `;` inside a string literal too).
- Alternatives: Allowlist statement prefixes only.
- Why: A prefix-only allowlist lets a trigger hide after an allowed statement and lets an arbitrary `DROP` through. FK handling during a rebuild stays the ADR 0002 open item, settled with the first rebuild migration.
- Reversible: yes.

### D-0124 — Stale version detected inside the statement

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 5 (#32) · Status: decided
- Decision: `updateWithVersion` sets `version = CASE WHEN version = expected THEN version + 1 ELSE NULL END`, so a stale row fails its NOT NULL constraint and the whole batch rolls back. The port maps `NOT NULL constraint failed: (po|dc|invoice).version` to `ConflictError` (409). This supersedes the "changes check" wording of ARCHITECTURE §8.1 and SPEC-05 §2 (owner delegated the wording fix to the orchestrator; revision 1.6).
- Alternatives: A `changes()` check after the batch (`batch()` returns void and the other statements would already be committed); a `RAISE()` guard (triggers only, forbidden by INV-84); a read before the batch (racy; no interactive transaction, C4).
- Why: INV-95 requires that nothing changes on a stale version. This is the only check that runs inside the one all-or-nothing batch, on node:sqlite and D1.
- Reversible: yes.

### D-0125 — Seed is a statement builder run by onboarding

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 5 (#32) · Status: decided
- Decision: `seedStatements(db, supplierId, rates = GST_DEFAULTS)` builds the supplier's GST `settings` rows for onboarding's batch; nothing is seeded into an empty DB. Keys `cgst_pct` and `sgst_pct` (`GST_KEYS`), values decimal strings from `pctToString` (`9`). Defaults 9 % CGST and 9 % SGST; IGST has no setting (A2-4).
- Alternatives: A supplier-less settings row; seeding at migration time.
- Why: `settings` is keyed by `(supplier_id, key)`, and no supplier exists before onboarding (INV-78).
- Reversible: yes.

### D-0126 — Edit of a deleted row (EC-25)

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 5 (#32) · Status: decided
- Decision: A versioned update of a missing row writes nothing and raises no conflict; services check that the row exists when they read its version. To revisit in SPEC-11.
- Alternatives: Treat it as a conflict (not detectable inside the batch without a trigger or a read).
- Why: INV-95 specifies only the stale-version case (C18).
- Reversible: yes.

### D-0127 — Synthetic fixtures with independently computed expected JSON

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 5 (#34) · Status: decided
- Decision: The parser fixtures added in PR 5 are synthetic. A one-off generator, kept outside the repo, writes each page and its expected JSON from one plain description; the expected values are computed from that description, never by running the parser. Cases with tricky parser rules (repeated item row, replaced lot, item 100+ description) have hand-written expected values. Only the pages and JSON are committed.
- Alternatives: Anonymise corpus pages (the corpus may not be read in this row); commit the generator as a tool.
- Why: C1. Committed fixtures are data reviewed as written; a committed generator would be a second, unreviewed model of the page format.
- Reversible: yes.

### D-0128 — Legacy-failure files covered by synthetic stand-ins

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 5 (#34) · Status: decided
- Decision: The SPEC-06 §6 category "files the legacy parser failed on" is covered by `legacy-item-100-description` (EC-23) and `legacy-drawing-separators` (D-0113) until anonymised corpus cases exist.
- Alternatives: Leave the category empty until H4.
- Why: Those are the documented cases where legacy extraction differs.
- Reversible: yes. Add anonymised corpus cases after SPEC-06 PR 6.

### D-0129 — Header value spelled like a label (EC-26)

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 5 (#34) · Status: decided
- Decision: v1 keeps the current `findByLabel` behaviour: a value such as `RC` beside `ORD-TYPE` reads as the `RC NO` label, so the field takes the cell below. A unit test in `po-header.test.ts` pins it; no fixture relies on it.
- Alternatives: Change the label lookup (inventing handling, C18).
- Why: Found while building the fixtures; neither the spec nor any decision covers it. The SPEC-06 PR 6 corpus test shows whether real pages have such values.
- Reversible: yes.

### D-0130 — `createApp` takes a handler map

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: `createApp(deps, handlers)` takes a map from route name to handler and mounts only the routes that have one, in the route table's order. Handlers get `{ params, query, body }` decoded by the table's schemas, and their return value is encoded by its response schema.
- Alternatives: One Hono sub-app per resource with `@hono/zod-validator`.
- Why: Each route's validation, codecs and error shape are in one place, and the route-table types are used directly. `@hono/zod-validator` would be one more dependency doing what `safeParse` already does.
- Reversible: yes.

### D-0131 — 10 MB cap on the whole body, before parsing

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: The 10 MB cap applies to the whole request body and is checked before parsing. An upload of several files that passes 10 MB in total is refused, even if each file is under 10 MB. The web client (SPEC-08 PR 3, SPEC-16) splits uploads into requests of at most 10 MB of JSON-encoded body, escaping included.
- Alternatives: A larger total cap for upload routes, with a per-file check after parsing; that needs a total limit no spec gives.
- Why: INV-110 refuses bodies before parsing, and a file's size is only known after parsing.
- Reversible: yes.

### D-0132 — 413 and 415 in the error hierarchy

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: `PayloadTooLargeError` (413) and `UnsupportedMediaTypeError` (415, a mutation that is not JSON) are added to the `AppError` hierarchy.
- Alternatives: Answer 400 for both.
- Why: SPEC-07 §6 asks for 413 for an oversize body and allows 415 for a text/plain POST.
- Reversible: yes.

### D-0133 — `createServices` added with the first service

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: `createServices(deps)` and `services/index.ts` arrive with the first service (SPEC-07 PR 4). `AppDeps` is `{ port, logger }` until later PRs need more. In production, `createApp(deps)` builds its handlers from `createServices`.
- Alternatives: An empty factory in PR 1.
- Why: No service existed yet; an empty seam would be speculative (ENGINEERING "Subtract before you add").
- Reversible: yes.

### D-0134 — Downloads named with RFC 5987 `filename*` only

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: A download's `Content-Disposition` is `attachment; filename*=UTF-8''<encoded>`, built by `contentDisposition` in `packages/schemas` beside the client's reader.
- Alternatives: Also send a quoted ASCII `filename=` fallback.
- Why: The only reader is our own client in WebView2/Chromium, which reads `filename*`; a fallback listed first would win in the client's parser and mangle non-ASCII names.
- Reversible: yes.

### D-0135 — Port line `SENSTO_PORT=<n>`; exit on stdin EOF

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: The node entry prints one line, `SENSTO_PORT=<n>`, once it is listening, and exits when stdin reaches EOF.
- Alternatives: `{"port": n}` as written in SPEC-07 §4.2.
- Why: ADR 0001 (accepted, SPEC-01 PR 1) chose this line and the stdin-EOF exit, and SPEC-07 depends on that decision.
- Reversible: yes, until SPEC-20 builds the shell.

### D-0136 — `SENSTO_DATA_DIR` overrides the data directory

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: `SENSTO_DATA_DIR`, when set, replaces `%LOCALAPPDATA%\SenstoSales`. With neither set, startup stops with a plain message.
- Alternatives: No override; fall back to the home folder.
- Why: Tests and development need a temporary data folder (the ADR 0001 spike used the same variable). A guessed folder could put data in the app folder, against INV-82.
- Reversible: yes.

### D-0137 — `config.json` created only when needed

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: `config.json` is neither created nor read until something needs it. Startup creates only the data folders.
- Alternatives: Write an empty `config.json` at startup.
- Why: Nothing in core stores configuration yet, and an empty file would be speculative.
- Reversible: yes.

### D-0138 — Health version from `package.json`; health job is the active one

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: `/api/health` reports `version` from `apps/api/package.json` (0.1.0), which SPEC-20's `stamp-version` will write from `VERSION`. Its `job` is the running job, else the oldest queued one, else `null`.
- Alternatives: A hard-coded constant; read `VERSION` at runtime (breaks inside the SEA); report only a running job.
- Why: INV-105 stamps `VERSION` into every `package.json`, and a JSON import is bundled into the SEA. A queued job is also busy from the shell's point of view.
- Reversible: yes.

### D-0139 — Storage keys: allow-list plus resolved-path check

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: Storage keys and SPA paths allow only `[A-Za-z0-9_.-]` names joined by `/`, and each resolved path must also stay under the root. Both checks run.
- Alternatives: Only the allow-list; only the resolved-path check.
- Why: Keys are system-made. The allow-list rejects drive letters, UNC paths, alternate data streams and backslashes on Windows without relying on path normalisation. The resolved-path check guards the file-system call itself, and SonarCloud's taint analysis recognises it (INV-96).
- Reversible: yes.

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

### D-0146 — Sessions last one year; remember-me sets the cookie's Max-Age

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Every session row expires one year after login (the legacy cookie's `Max-Age`). Without remember-me the cookie has no `Max-Age` and ends with the browser session; with it, `Max-Age=31536000`.
- Alternatives: Legacy's two cookies, both with a one-year Max-Age; a shorter server lifetime without remember-me.
- Why: A2-11 says "session cookie plus remember me"; legacy server tokens never expired and one year is its only lifetime.
- Reversible: yes.

### D-0147 — Change password and reset end every session, the caller's included

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Both delete all session rows and clear the caller's cookie, so the UI returns to the login.
- Alternatives: Keep the caller's session and end only the others.
- Why: The legacy flow logs the user out ("Please log in again"; frozen flow, C7), and it satisfies INV-80's "ends other sessions".
- Reversible: yes.

### D-0148 — No user row means the default password

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Nothing is seeded. Until the first login there is no `app_user` row and the password is `admin` (D-0004). The first login creates the row in its batch (`ON CONFLICT DO NOTHING` on the username, with the user id read by username inside the batch, so overlapping first logins both succeed). Reset-to-defaults deletes the row and every session.
- Alternatives: Seed the row in a migration; create it in onboarding.
- Why: Startup is read-only (C9), and one representation of "default" avoids hashing `admin` on reset.
- Reversible: yes.

### D-0149 — A wrong current password is 400, not 401

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Change password and reset answer 400 `wrong-password` or `current-password-required` with the field path `body.currentPassword`. A wrong login password is 401 `wrong-password`; a missing or expired session is 401 `signed-out`.
- Alternatives: 401 for all, as legacy.
- Why: A 401 on a signed-in settings form would read as "session ended" to the client.
- Reversible: yes.

### D-0150 — Logout ends only this session

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Logout deletes the caller's session row only.
- Alternatives: End every session, as legacy's single-token store did.
- Why: Legacy kept one session at a time, so the two behave alike for its single WebView; INV-80 names only change password and reset as ending other sessions.
- Reversible: yes.

### D-0151 — PBKDF2 at 600 000 iterations in a self-describing hash

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`, 16-byte salt, 600 000 iterations.
- Alternatives: A fixed format without the iteration count.
- Why: The OWASP figure for PBKDF2-SHA256; storing the count lets it rise without invalidating stored hashes.
- Reversible: yes.

### D-0152 — A new, empty database is backed up before migration 0001

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 3 (#39) · Status: decided
- Decision: Startup treats a version-0 database like any older one: it writes `pre-upgrade-0-<ts>.db` before applying 0001, so every first launch leaves one small backup.
- Alternatives: Skip the backup at version 0, since there is nothing to keep.
- Why: C9 says "always after a backup", and SPEC-07 §4.2 and ARCHITECTURE §13.3 back up on any `<` with no exception. One special case fewer.
- Reversible: yes.

### D-0153 — Backup file stamp `YYYYMMDDTHHMMSSZ` (UTC)

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 3 (#39) · Status: decided
- Decision: The `<ts>` in `pre-upgrade-<version>-<ts>.db` is `Clock.now()` without separators or milliseconds, for example `20250401T053000Z`.
- Alternatives: The ISO instant with `:` replaced; IST local time.
- Why: The spec sets no format. `:` is not allowed in Windows file names. This form sorts by time, and UTC matches `applied_at`.
- Reversible: yes.

### D-0154 — A failed backup stops the upgrade

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 3 (#39) · Status: decided
- Decision: If `backupTo` fails, no migration runs, and startup exits with "SenstoSales could not back up its data, so it did not upgrade it. Nothing was changed."
- Alternatives: Migrate without a backup.
- Why: C9 allows the upgrade only after a backup.
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

### D-0165 — Onboarding gate answers 409 before the session check

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: Before a supplier exists, every non-public route answers 409 `onboarding-required`, checked before the session. `GET /api/onboarding` always answers; `POST /api/onboarding` answers 409 `already-set-up` once a supplier exists.
- Alternatives: Check the session first (401 on first run, when nobody can be signed in), or hide the onboarding routes with 404 after setup.
- Why: SPEC-07 §6 asks for a 409 `onboarding-required` redirect signal, and the SPA needs the status on every launch.
- Reversible: yes.

### D-0166 — One supplier enforced inside the onboarding batch

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: The onboarding batch ends with a statement that fails it if a second supplier row would exist, using the same NOT NULL technique as `updateWithVersion`. Onboarding maps exactly that failure to 409 `already-set-up`.
- Alternatives: A singleton unique column (needs a migration to a shared table), or check-then-write only (two overlapping submits create two suppliers).
- Why: A2-12 allows one supplier per install, and a double submit is a realistic way to get two. No schema change is needed.
- Reversible: yes.

### D-0167 — The supplier id is cached once found

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: The services and the onboarding gate share one supplier id, looked up until found and then kept for the life of the process.
- Alternatives: Query the supplier on every request (two lookups per request before this change).
- Why: No route or job deletes the supplier, so a found id stays correct. A later restore that swaps the database must rebuild the services.
- Reversible: yes.

### D-0168 — Settings PUT replaces every row; GST keys win

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: `PUT /api/settings` rewrites all of the supplier's `settings` rows. A preference whose key is `cgst_pct` or `sgst_pct` is dropped.
- Alternatives: Merge preferences, or reject a reserved key with 400.
- Why: The body is the full settings shape, and the rates must stay the typed fields.
- Reversible: yes.

### D-0169 — Audit actions and values for supplier data

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: The actor is `admin`. The actions are `onboarding`, `update-supplier`, `update-settings`, `create-buyer`, `update-buyer`, `delete-buyer`, `set-bhel-password` and `clear-bhel-password`. Each row carries the before and/or after values, except the BHEL password rows, which carry no values.
- Alternatives: Store no values in any audit row.
- Why: The audit log records changed values (ARCHITECTURE §8.2), and INV-81 forbids storing the secret.
- Reversible: yes.

### D-0170 — The secrets service implements the Secrets port

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: `createSecretsService` implements the `Secrets` port (`get`, `set`) over the `secret` table. Each `set` is one batch with its audit row. The status route derives `saved` from `get`.
- Alternatives: A separate platform adapter, which would bypass the batch and audit rule.
- Why: The secret is a DB row, so its writes follow C4 like every other write.
- Reversible: yes.

### D-0171 — Buyers listed by unit name; delete is unconditional

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: `GET /api/buyers` lists buyers by unit name, then id. Delete is unconditional, as in legacy, even though `po.buyer_id` may reference the buyer. That column has no foreign key, so the PO keeps a dangling id (EC-30).
- Alternatives: Order by creation time. Refuse the delete while a PO references the buyer, or clear the references.
- Why: Readable in the settings list. Delete follows the frozen legacy behaviour, because the spec is silent on references.
- Reversible: yes.

### D-0172 — PO list text filter

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: `q` matches the PO number or the GEMC number, case-insensitively, with `%` and `_` taken literally.
- Alternatives: The legacy LIKE without escaping; also matching material codes.
- Why: Legacy searched the PO number, supplier name and GEMC number, and the supplier is always ours.
- Reversible: yes.

### D-0173 — PO list order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: The default is PO date descending. Every sort is followed by PO date descending, then PO number descending, then id. PO numbers sort as integers, with the text as a tiebreak. Status sorts by the legacy rank Pending < Delivered < Closed. A missing value sorts first ascending.
- Alternatives: Text order for PO numbers; alphabetical status.
- Why: Matches the legacy list's visible order.
- Reversible: yes.

### D-0174 — PO list filter semantics

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: `valueMin`/`valueMax` compare `COALESCE(po_value, 0)`, and stats sum a missing value as 0. `flagged=true` keeps POs with at least one open flag and `flagged=false` keeps POs with none; `gemc=false` keeps non-GEMC POs.
- Alternatives: Exclude POs with no value; treat `false` as "no filter".
- Why: Legacy treated a missing value as 0; `false` is the plain reading of a boolean filter.
- Reversible: yes.

### D-0175 — PO item count counts every item

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: `itemCount` includes cancelled items.
- Alternatives: Active items only.
- Why: Legacy counted every item row, and the detail still lists cancelled items.
- Reversible: yes.

### D-0176 — PO uninvoiced total from the domain

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: The list row's `uninvoicedQty` is computed per page by the domain's `poUninvoicedQty` over the stored item columns, and is not stored.
- Alternatives: A `po.uninvoiced_qty_m` column persisted by recompute.
- Why: No such column exists in ARCHITECTURE §8.2, and C2 keeps the sum in the domain. Uninvoiced is not a sort key, so SQL never needs it.
- Reversible: yes.

### D-0177 — PO detail flags and lists order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: The detail returns open flags only, oldest first. Lots are ordered by lot number; linked documents by document date, oldest first.
- Alternatives: Include acknowledged flags.
- Why: SPEC-10 §2 names open flags; the flags screen (PR 5) shows acknowledged ones.
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

### D-0194 — SRV list totals computed in the service

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: The service loads the lines of every SRV the SQL filters keep (text, date range, PO number), totals them with the domain's `srvTotals`, then applies the value range, sorts and pages in memory; both views and the stats share this path. This departs from the SPEC-10 §4.1 wording (sorting and filters in SQL) to keep INV-11 out of SQL (C2).
- Alternatives: Aggregates in SQL with `COALESCE(NULLIF(rcd,0), accepted, 0)` (as legacy); stored per-SRV total columns.
- Why: SRV totals are not stored derived columns; computing INV-11 in SQL would place a business rule outside `packages/domain` (C2), and a stored column changes the schema.
- Reversible: yes.

### D-0195 — SRV value

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Value = Σ (line received × the matched PO item's rate), each line rounded once to 5 dp; an unmatched line, or one of a PO not in the system, adds 0.
- Alternatives: The SRV item rate (not stored, D-0107); rounding to 2 dp.
- Why: The legacy SRV list's Value column (C7 frozen visible value), with the exact rounding rule (D-0021).
- Reversible: yes.

### D-0196 — SRV list ordered column

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: The flat list shows Σ ordered of the distinct PO items the SRV is matched to; the by-PO view shows the PO's stored `ord_qty`; a PO not in the system shows 0.
- Alternatives: The SRV page's own ORD QTY.
- Why: What the legacy lists show.
- Reversible: yes.

### D-0197 — Accepted shows received on the SRV screens

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Lists, stats and detail show Accepted as the line's received quantity (`srvLineShown`).
- Alternatives: The stored accepted quantity, which the legacy SRV list summed.
- Why: INV-09, A2-8 and EC-11 ("v1: Accepted shows 10"); the `zSrvListRow` schema says the same.
- Reversible: yes.

### D-0198 — SRV stats

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Counts and sums over the SRVs the filters keep, the value range applied per SRV; `poCount` is the number of distinct PO numbers among them.
- Alternatives: Separate stats per view.
- Why: D-0096: stats take the same filters as their list.
- Reversible: yes.

### D-0199 — SRV text filter

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: `q` matches the SRV number, the PO number or any item's invoice number.
- Alternatives: SRV and PO number only.
- Why: The legacy search fields; the invoice number lives on items here.
- Reversible: yes.

### D-0200 — SRV list order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Without a sort, newest first (SRV date, SRV number, id; by-PO: latest SRV date, PO number); a chosen sort breaks ties by that default order; SRV and PO numbers sort numerically.
- Alternatives: Ties in the chosen direction.
- Why: The legacy default is `srv_date DESC`; stable pages need a total order.
- Reversible: yes.

### D-0201 — Flags on SRV detail and delete

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: The detail returns the open flags scoped to the SRV's items; delete leaves flags in place.
- Alternatives: Delete the flags of the deleted items.
- Why: ARCHITECTURE §6.9 and INV-59: flags remain until acknowledged, even when their condition disappears; the PO detail shows open flags too.
- Reversible: yes.

### D-0202 — SRV delete audit row

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Audit action `delete-srv`, entity `srv`, `before` = PO number, SRV number, SRV date and item count.
- Alternatives: `srv.delete`.
- Why: Matches the `delete-buyer` naming.
- Reversible: yes.

### D-0203 — Retarget stacked PRs to the merged PR's base

- Date: 2026-10-15 · Spec/PR: orchestrator tools (#48) · Status: decided
- Decision: Before merging, `merge_pr.sh` retargets each open PR based on the PR's branch to that PR's own base, not a hard-coded `main`.
- Alternatives: Always retarget to `main`.
- Why: GitHub deletes a merged PR's branch and closes the PRs based on it (#43 on #42). The PR's base is `main` in the usual case, keeps a longer stack intact, and needs no config value.
- Reversible: yes.

### D-0204 — Retarget before the merge, refuse on failure

- Date: 2026-10-15 · Spec/PR: orchestrator tools (#48) · Status: decided
- Decision: The retarget runs before `gh pr merge`; a failed list or retarget refuses the merge.
- Alternatives: Retarget after the merge, or warn and merge anyway.
- Why: After the merge the stacked PRs are already closed. If the merge then fails, the retargeted PRs only point at the base they would need anyway.
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

### D-0211 — Manual PO form stored through PO ingest

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: Create and edit build `PoValues` from the form and store them with `storePoStatements`, the same batch as upload, so cancel/restore (INV-48), SRV matching of "PO not found" SRVs (INV-39, INV-40) and recompute apply alike.
- Alternatives: A separate manual write path.
- Why: Legacy mapped the form to the scraper format and ran its ingest; one store path keeps the rules in one place.
- Reversible: yes.

### D-0212 — What a manual PO edit keeps

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: Amendment no., BHEL status code, PO value and net value, the PO document's rcd/rej per item, the manual dispatched qty and the lots' entry-allow date/note are kept from the stored rows. A new manual PO has amend 0, no PO value, rcd 0 and rej null.
- Alternatives: Clear them.
- Why: The form has no fields for them, and clearing them would silently change received quantities and status.
- Reversible: yes.

### D-0213 — An item left out of a manual edit is cancelled

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: As for a re-ingested PO (INV-48); sending it again restores it.
- Alternatives: Delete the item.
- Why: Items may carry DC, invoice or SRV lines; legacy's edit ran through ingest.
- Reversible: yes.

### D-0214 — Default lot on the manual form

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: An item sent without lots gets lot 1 of the ordered quantity, due on the PO date, as the legacy form did.
- Alternatives: No lot.
- Why: Frozen legacy behaviour (C18).
- Reversible: yes.

### D-0215 — Manual PO form checks

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: 400 for no PO date, no items, a duplicate item number, ordered qty <= 0 or rate <= 0, each with a field path.
- Alternatives: Client-side only, as legacy.
- Why: Malformed input; recompute needs the PO date, and a duplicate item number would otherwise be a 500.
- Reversible: yes.

### D-0216 — GEMC on the manual form

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: A PO is GEMC when the form's GEMC number field is not blank, and a blank field is stored as null.
- Alternatives: Derive it from the remarks (INV-19), as for uploads.
- Why: The legacy form has its own GEMC number field and legacy decided GEMC from it.
- Reversible: yes.

### D-0217 — PO number on manual create and edit

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: Create with a stored number is 409 `po-exists`; an edit that changes the number is 400 `po-number-changed`.
- Alternatives: Upsert, as legacy create did.
- Why: An upsert from the create form would silently overwrite a PO; legacy refused a different number on edit.
- Reversible: yes.

### D-0218 — Stale version mapped once

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: `app.onError` maps the db `ConflictError` to 409 `stale-version` for every route.
- Alternatives: Map it per service.
- Why: Every versioned entity (PO, DC, invoice) needs the same answer.
- Reversible: yes.

### D-0219 — PO delete keeps SRVs and raw HTML

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: The delete removes flags, lots, items and the PO (SPEC-10 §2). SRVs stay with `po_id` and `po_item_id` cleared, and stored source documents stay (INV-107).
- Alternatives: Delete the SRVs too.
- Why: SPEC-10 §9 open issue and A2-9.
- Reversible: yes.

### D-0220 — Setting the manual quantity bumps the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 3 (#49) · Status: decided
- Decision: The manual dispatched quantity batch starts with `updateWithVersion(po, poId, versionRead, {})`, where the version is read before the recompute snapshot.
- Alternatives: Leave the version alone, as recompute does (D-0142). Add a `version` to the request body.
- Why: It is a user edit of the PO. An ingest or edit that loaded its snapshot earlier fails instead of writing `dsp_qty` from stale rows, and this batch fails the same way if another versioned write landed after its read. The route table fixes the body shape, so the version comes from the read.
- Reversible: yes.

### D-0221 — An omitted note clears the stored manual note

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 3 (#49) · Status: decided
- Decision: `{ qty }` without `note` stores `manual_note = NULL`. The quantity and note are set together.
- Alternatives: Keep the previous note when `note` is omitted.
- Why: This is the conservative reading of `{ qty >= 0, note? }`: the note describes the current quantity, so a stale note never stays attached to a new quantity.
- Reversible: yes.

### D-0222 — `manual_set_at` is set on every change

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 3 (#49) · Status: decided
- Decision: Every successful set stamps `manual_set_at = now`, including a change back to 0.
- Alternatives: Stamp only when `qty > 0`.
- Why: SPEC-10 §2 says the endpoint "sets `manual_set_at`" with no condition. INV-57 already ignores it while the quantity is 0.
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

### D-0226 — Acknowledging an acknowledged flag is a 409 that writes nothing

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: Acknowledging a flag that is already acknowledged answers 409 `flag-acknowledged` and writes nothing; the first note and time stay. This holds for concurrent requests too: the update sets `status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE NULL END`, so a losing request fails its NOT NULL constraint and its batch, audit row included, rolls back (the check of D-0124). The port reports it as stale `reconciliation_issue`, and the service maps that to the same 409.
- Alternatives: Overwrite the note and time; answer 200 with no change; guard the update in its WHERE clause only (a losing request would still write an audit row and answer 200).
- Why: INV-59 makes acknowledgement a one-way `open -> acknowledged` step. Overwriting would lose the first acknowledgement, and a silent 200 would hide that the note was not saved.
- Reversible: yes.

### D-0227 — Flag and audit text filters

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: The flags list `q` matches the PO number. The audit list `q` matches the action, entity type or entity id.
- Alternatives: Also match the flag details or the audit before/after values.
- Why: These are the identifying text columns each screen shows; the JSON values are not searchable columns.
- Reversible: yes.

### D-0228 — Audit date filter uses IST calendar dates

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: The audit list's `from`/`to` are IST calendar dates (C3), applied to the stored UTC `at` as `[from 00:00 IST, to + 1 day 00:00 IST)`. The bounds are computed on the constant side, so the column is compared as stored.
- Alternatives: UTC dates.
- Why: Every date the user sees is an IST calendar date.
- Reversible: yes.

### D-0229 — Audit row for acknowledging a flag

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: Action `flag.acknowledge`, entity type `reconciliation_issue`, entity id the flag id; before and after are `{ status, note }`.
- Alternatives: `acknowledge-flag`; entity type `flag`.
- Why: Matches the `<entity>.<verb>` actions of the newer services and the table name as entity type.
- Reversible: yes.

### D-0230 — The concurrent-batch rule is a skill rule, not a tools/checks scan

- Date: 2026-10-15 · Spec/PR: process (#52) · Status: decided
- Decision: The concurrent batch race (#37, #40, #50) is prevented by a skill rule (`/review-pr` §2.2, `/implement-pr` §4) and the regression test it requires, not by a `tools/checks` scan.
- Alternatives: A text scan that pairs status-guarded UPDATEs with audit inserts.
- Why: The guard (repositories) and the audit insert (shared service helper) are in different modules and joined at runtime; status filters also appear in reads and bulk updates; and a scan cannot see whether a guard fails the batch. It would be noisy and incomplete.
- Reversible: yes.

### D-0231 — The concurrent-batch rule sits in review-pr §2.2 Correctness

- Date: 2026-10-15 · Spec/PR: process (#52) · Status: decided
- Decision: The rule is part of `/review-pr` §2.2 (Correctness), not only reached through §2.6 (Recurring findings).
- Alternatives: Rely on the RECURRING.md row alone.
- Why: Reviewers then apply it to every write use case.
- Reversible: yes.

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

### D-0238 — Tracker rows

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: One row per lot with a delivery date, carrying its item's stored quantities; the item is open while Pending or Delivered. Overdue: before today and Pending. Due soon: today to today + 7 and Pending. Due this month: in today's month and open.
- Alternatives: The legacy per-lot FIFO allocation of dispatched and received quantities.
- Why: No quantity is allocated to a lot (INV-06); the buckets keep the legacy tracker's date rules and its not-dispatched and not-received tests, read from the stored item status.
- Reversible: yes.

### D-0239 — Tracker value filter and pending value

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: `valueMin`/`valueMax` compare the lot's scheduled value (lot qty × rate), as the legacy filter does. A row's `pendingValue` is its item's balance × rate; stats sum the pending value once per item.
- Alternatives: Filter on the pending value; sum the row values.
- Why: Legacy filter semantics; with item-level balances a per-lot sum would count an item with several lots more than once.
- Reversible: yes.

### D-0240 — Tracker stats and the status toggle

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: The three counts ignore `status`; `pendingValue` follows it; the other filters narrow both.
- Alternatives: Apply `status` to everything.
- Why: As legacy: the cards are the toggles and keep their counts while one is active.
- Reversible: yes.

### D-0241 — Tracker default order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: Delivery date descending, then PO number (numeric), item number, lot number and lot id; a chosen sort breaks ties by that order. A missing entry date or material code sorts first ascending.
- Alternatives: Ties in the chosen direction.
- Why: The legacy default is `dely_date DESC`; stable pages need a total order (as D-0173, D-0200).
- Reversible: yes.

### D-0242 — Dashboard periods and counts

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: `month` starts on the 1st of today's month, `30d` 30 days back. PO value, ordered, dispatched and pending dispatch value cover POs dated in the period; invoiced value and quantity cover invoices dated in it; received covers SRV lines dated in it (INV-11); lead time covers POs dated in it. Overdue lots, DCs without an invoice and open flags are as of today.
- Alternatives: Apply the range to everything.
- Why: The legacy dashboard's queries.
- Reversible: yes.

### D-0243 — Dashboard activity

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: The five POs, DCs and invoices that entered the system last, newest first. A PO's time is its first `po.ingest` or `po.create` audit row; SRVs are not listed (`zActivity`).
- Alternatives: A `created_at` column on `po` (a schema change).
- Why: Legacy sorted by `created_at` and showed five; `po` has no creation column and the audit row records when the PO entered.
- Reversible: yes.

### D-0244 — Search matching and ranking

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: Numbers match from their start; item code and drawing number from their start and description anywhere; DC consignee and invoice buyer anywhere; an SRV also by its PO number (from the start for digits). Digits alone skip party names, one digit skips items, `*` is no text, and no text with no filter finds nothing. Five per type, then a stable merge by exact number, number prefix, other. `match` is the matched value as stored.
- Alternatives: The legacy six-level ranking over display strings; labelled match text such as `Code: X`.
- Why: The same visible results without building display strings in the API (C7).
- Reversible: yes.

### D-0245 — Search values and flags

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: PO: stored PO value and ordered total. DC: Σ line qty × rate and dispatched qty. Invoice: stored total and invoiced qty. SRV: accepted value and qty from `srvTotals`. The value range applies to PO, invoice and SRV, not DC, as legacy. `hasFlags`: an open flag on the PO, or on one of the document's lines. `party` is null for PO and SRV (the supplier is always ours).
- Alternatives: Flags through SRV links as well.
- Why: Legacy fields; flags are scoped to lines in this schema (§6.9).
- Reversible: yes.

### D-0246 — Shared paging helpers

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: `apps/api/src/services/paging.ts` holds the comparator and page helpers that the SRV lists and the tracker use.
- Alternatives: A copy per service.
- Why: One implementation of the list convention for lists sorted in memory.
- Reversible: yes.

### D-0247 — DC create guards and retries on the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: DC create starts its batch with `updateWithVersion(po, poId, versionRead, {})`, with the version read before the snapshot, as D-0220 does. On a stale PO the service rebuilds and retries the create up to 3 times, then answers 409 `stale-version`.
- Alternatives: Leave the PO version alone (D-0142), which lets two overlapping creates write `dsp_qty` from stale rows; answer 409 on the first stale read, which would reject a valid DC because of an unrelated concurrent write (C6).
- Why: A DC changes the PO's quantities, and the retry keeps C6: concurrency is never a reason to reject.
- Reversible: yes.

### D-0248 — DC and GC numbers stored trimmed

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: DC and GC numbers are stored trimmed, and a number that is blank after trimming is 400 `number-blank`.
- Alternatives: Store the number as typed.
- Why: Lookups and links compare trimmed numbers (INV-24, `docKey`), so " 7 " and "7" must be one number for the `(number, FY)` index to mean what the links mean.
- Reversible: yes.

### D-0249 — A double collision names the DC number

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: When the DC number and the GC number both collide, the 409 names the DC number. After the refused batch, the service reads the stored DCs to choose the message, because SQLite reports only one index.
- Alternatives: Report whichever index SQLite names.
- Why: A blank GC defaults to the DC number, so both collide whenever a DC number is reused, and "GC 100 already exists" would mislead.
- Reversible: yes.

### D-0250 — DC line errors at their body paths

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: The 400 for invalid lines uses the first domain issue's code and lists every issue in `details.fields` at its body path (`lines.N.qty` → `body.items.N.dspQty`).
- Alternatives: One error per request with no field paths.
- Why: The form can show each message on its line, and the codes are the ones SPEC-11 §4.3 lists.
- Reversible: yes.

### D-0251 — Link re-resolution reads a superset, the domain decides

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: `reresolveLinks` prefilters SRV items with `instr(cited, number) > 0`, a superset of every trimmed match, keeps only items whose cited number matches one of the changed numbers through `docKey`, and leaves the link to `resolveDocLink`.
- Alternatives: Match with SQL `trim()` (its whitespace set differs from JS `trim`, a second rule, C2); a normalised indexed column (needs a migration).
- Why: One business rule, in the domain.
- Reversible: yes.

### D-0252 — Dispatchable defaults carry the supplier snapshot

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: Dispatchable `defaults` carry the supplier snapshot from the supplier row, and every other header field is blank (EC-36).
- Alternatives: Legacy's consignee name from a setting, the address from a default buyer, and department no and our ref from PO columns; none of these exist in v1.
- Why: C18: don't invent inputs.
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

### D-0257 — Test helpers feed child stdin from a file, never a pipe

- Date: 2026-10-15 · Spec/PR: process fix (#57) · Status: decided
- Decision: `run()` in `tools/orchestrator/test/shell.ts` gives the child a temp file as stdin (empty when there is no input) instead of spawnSync's `input` pipe.
- Alternatives: Drain stdin in the hook command (changes production for a test); catch EPIPE in `run()` (hides failures, in effect a retry); special-case the one test (other callers keep the race).
- Why: A child that exits without reading stdin races the pipe write, and on Linux the lost race is an EPIPE (23 and 34 of 400 loaded runs failed before, 0 of 1,200 after); a file has no write to race.
- Reversible: yes.

### D-0258 — The xlsx writer streams through a readable-stream PassThrough

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: The xlsx writer gives exceljs a `readable-stream` PassThrough and yields its chunks as an `AsyncGenerator<Uint8Array>`, so routes can pipe it through `hono/streaming` and `packages/documents/src` imports no `node:*` module (C12).
- Alternatives: A `node:stream` adapter under `packages/documents/src/platform/node` with an export port injected into the API; a duck-typed sink.
- Why: exceljs's `WorkbookWriter` needs a Node-style writable; readable-stream is the userland stream library (MIT, browser-capable) that exceljs's own stack uses. A port would add wiring with no second adapter.
- Reversible: yes — one function.

### D-0259 — The xlsx writer paces itself every 50 rows

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: The xlsx writer yields to the event loop every 50 rows and waits for drain while the reader is not reading.
- Alternatives: No pacing (measured heap grows linearly with rows); pacing on output progress (can deadlock while deflate waits for input).
- Why: exceljs hands sheet XML to an asynchronous deflate without backpressure, and node:sqlite resolves at once, so an unpaced export buffers the whole sheet. Measured flat at 50k–400k rows.
- Reversible: yes — a constant.

### D-0260 — Export cells are string, number or null

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: Cells are `string | number | null`. Strings are text (string cells; CSV prefix rule); numbers stay numeric with the column's number format; dates and quantities arrive already formatted or scaled by the services through the shared formatters (SPEC-13 PR 3).
- Alternatives: Typed date and quantity cells in the writer.
- Why: Keeps INV-94 in one place by JS type and leaves layouts and formats to the catalog (SPEC-13 PR 1) and goldens.
- Reversible: yes.

### D-0261 — CSV form: UTF-8 without BOM, CRLF, RFC 4180 quoting

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided; BOM part superseded by D-0287
- Decision: CSV is UTF-8 with no BOM, CRLF line endings and RFC 4180 quoting; headers are quoted by the same rule but never prefixed.
- Alternatives: LF endings; a BOM.
- Why: No golden exists yet (H5). This is the conventional CSV form; SPEC-13 PR 3's exact-text goldens confirm or change it in one place (`line`).
- Reversible: yes.

### D-0262 — Keyset key parts name a selected field

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: Keyset key parts name a selected field (`{ by, dir, field }`) rather than computing their value in JS. A nullable column is keyed as `COALESCE(column, value)`. The last part must be the id.
- Alternatives: `of: (row) => value` accessors (can drift from the SQL, e.g. CAST vs `Number`); row-value comparisons (cannot mix directions).
- Why: The cursor then always holds the exact SQL value it is compared with.
- Reversible: yes.

### D-0263 — unzipper 0.12 for exceljs

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: Override `exceljs>unzipper` to `^0.12.3`.
- Alternatives: Allow-list the unlicensed `buffers@0.1.1` (weakens C13's check); a different Excel library (exceljs is the named library).
- Why: exceljs 4.4 pins unzipper 0.10, whose `binary` -> `buffers` chain declares no licence, and the licences job denies it. unzipper 0.12 drops the chain and keeps the `Parse` API exceljs's stream reader uses; exceljs loads unzipper eagerly, so `"-"` is not possible.
- Reversible: yes — remove the override when exceljs updates.

### D-0264 — DC edit and delete guard the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: DC edit and delete batches include `updateWithVersion(po, poId, versionRead, {})` for the DC's PO, with the version read in the same statement as the DC (`findDcWithPo`); an edit also guards every other PO it recomputes, each version read before its snapshot. A stale PO is retried (3 attempts); a stale DC on edit is 409.
- Alternatives: Guard only the DC version, which leaves an edit racing a delete writing an audit row for a deleted DC (EC-25).
- Why: One guard covers vanished rows and stale snapshots, as D-0220 and D-0247 do.
- Reversible: yes.

### D-0265 — DC delete fails its batch if a link appears before commit

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: The delete batch starts with `stillUnlinked`, which sets `dc.version` to `CASE WHEN <an invoice or a linked SRV item exists> THEN NULL ELSE version END`; the delete retries on a stale `dc`, and the retry answers the blocked-delete 409.
- Alternatives: Rely on the invoice foreign key (there is none on `srv_item.resolved_dc_id`).
- Why: INV-35 must hold when an SRV ingest commits between the delete's read and its commit (D-0124 check).
- Reversible: yes.

### D-0266 — A DC edit recomputes every PO whose SRV items change link

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: Besides the DC's PO, every PO owning an SRV item whose link the edit changes is recomputed in the same batch, so a dropped link raises `DOC_NUMBER_CONFLICT` there. `reresolveLinks` returns those PO ids.
- Alternatives: Recompute only the DC's PO, as create does (enough for create, which only adds links).
- Why: EC-14 and ARCHITECTURE §6.9 flag the SRV item on its own PO.
- Reversible: yes.

### D-0267 — A DC edit keeping the number and FY skips link re-resolution

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: When the trimmed number and the FY of the new date equal the stored ones, the edit re-resolves no SRV links.
- Alternatives: Re-resolve on every edit.
- Why: Links resolve by `(number, FY)` (INV-24), so none can change; this saves the `instr` scan on the common header edit.
- Reversible: yes.

### D-0268 — DC list columns follow the legacy list

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: Per DC: ordered = Σ of each line's PO item `ord_qty`, dispatched = Σ line `dsp_qty`, received = Σ of each line's PO item `rcd_qty` (EC-38), value = Σ `qtyValue(dsp, rate)`. `q` matches the DC number, PO number and consignee; the date range applies to `dc_date` and the value range to the value. Default order date desc, number desc, id; paged in memory with `paging.ts` (D-0246). `openFlagCount` counts open flags on the DC's lines (`dc_item`), as search's `hasFlags` (D-0245); legacy had no flag count.
- Alternatives: Received from the SRV items linked to the DC (a new rule).
- Why: C7 and C18 freeze the legacy output.
- Reversible: yes.

### D-0269 — DC detail flags and SRVs

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: The detail's `flags` are the open flags on the DC's lines; `srvs` are the SRVs with an item whose `resolved_dc_id` is the DC (INV-37).
- Alternatives: Legacy matched `challan_no = dc_number` without the FY, which INV-24 forbids.
- Why: Links are FY-qualified and stored resolved.
- Reversible: yes.

### D-0270 — DC edit GC defaults follow INV-26

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: A blank GC number or date on edit takes the DC's number or date, as on create.
- Alternatives: Legacy's full update set a blank GC date to today.
- Why: INV-26 names the DC date.
- Reversible: yes.

### D-0271 — DC delete-blocked body

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: A blocked DC delete is 409 `delete-blocked` with `details.reason` the domain reason (`dc-has-invoice`, `dc-linked-srv`) and a plain message.
- Alternatives: One code per reason.
- Why: Matches PO delete; the UI shows the reason.
- Reversible: yes.

### D-0272 — DC-sourced invoice lines are built from the DC's lines

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: After INV-29 validation, the stored lines come from the DC's lines (DC order, DC qty, PO rate), not from the request.
- Alternatives: Store the request's lines.
- Why: Validation has proved them equal, and building from the DC removes a lookup per line.
- Reversible: yes.

### D-0273 — Invoice create 409 codes

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: A unique-index refusal maps to `invoice-number-taken` ("Invoice N already exists in FY X.") or `dc-has-invoice` ("DC N already has an invoice."). There is no pre-read check; the indexes decide.
- Alternatives: Pre-check with a read, which would still need the index for concurrent creates.
- Why: SPEC-11 §4.2 says to map the index violations, and one mechanism covers both the single and the concurrent case.
- Reversible: yes.

### D-0274 — Invoice 400 field paths

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: As D-0250, the 400 carries the first issue's code and every issue at `body.lines.N.<field>`. An empty `lines` reports `dc-line-missing` (D-0041), not `no-lines`.
- Alternatives: `no-lines` for an empty invoice.
- Why: `validateDcInvoiceLines` already decides this, and C2 keeps the rule in one place.
- Reversible: yes.

### D-0275 — Invoice create guards and retries on the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: The same rule as D-0247: `updateWithVersion(po)` first in the batch, with the version read before the snapshot, retried up to 3 times through the shared `retrying` helper.
- Alternatives: No guard, which lets two invoices on one PO write `uninvoiced_qty` from stale rows.
- Why: An invoice changes the PO's derived quantities.
- Reversible: yes.

### D-0276 — PO-direct kind is a 400 until PR 4

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: `kind: "direct"` answers 400 `kind-unavailable` and writes nothing. PR 4 replaces this.
- Alternatives: Narrow the shared body schema, which would break the client contract.
- Why: The route body is a union, and a plain refusal is honest until the mode exists.
- Reversible: yes.

### D-0277 — Buyer snapshot as sent

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: Create stores the buyer fields from the body (the form is prefilled by the preview, PR 4) and does not fill blanks from the `buyer` table.
- Alternatives: Default blanks from the PO's buyer.
- Why: C18 says not to invent defaults; the preview is where defaults come from.
- Reversible: yes.

### D-0278 — De-branded templates rebuilt by a committed tool

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: `tools/gen/src/debrand-templates.ts` rebuilds each legacy template through exceljs from a per-file plan. Labels are kept, identity cells become placeholders, and every other value is cleared. Document properties are blanked (exceljs writes `Unknown` for an empty author), created and modified dates are fixed, and headers and footers are dropped. The tool reads the legacy folder from `SENSTO_LEGACY_TEMPLATES_DIR`; legacy files never enter the repo.
- Alternatives: Commit edited copies of the legacy files; generate the templates entirely from code.
- Why: Anything the plan doesn't name is cleared, so the rebuild drops hidden legacy content (merged-cell leftovers, metadata, shared strings) while the visible layout stays frozen (C1, C7, C16). The tool is reproducible for reviewers and later fixes.
- Reversible: yes.

### D-0279 — What stays in a template

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: Constant text stays as it appears in the legacy template, even where legacy code rewrites the same text on every document. Values filled per document are cleared, keeping their styles and number formats. Identity cells get `{supplier.name}`, `{supplier.address}`, `{supplier.gstin}`, `{supplier.contact}`, `{supplier.state}` and `{supplier.stateCode}` (`zSupplier` fields), plus `{supplier.description}` (DC/GC letterhead line 2) and `{supplier.jurisdiction}` (invoice "SUBJECT TO … JURISDICTION").
- Alternatives: Clear every cell legacy code writes; keep the jurisdiction city as a fixed label.
- Why: The templates show the frozen document as legacy did. The jurisdiction line names the supplier's city, so it is identity.
- Reversible: yes.
- Follow-up: `zSupplier` has no `description` or `jurisdiction` field (legacy read the description from a `supplier_description` setting). SPEC-12 PR 3 and PR 4 source both; the most conservative reading is `invoiceDefaults` keys.

### D-0280 — Invoice template sheet named `Sheet1`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: The invoice template's sheet is `Sheet1`.
- Alternatives: Keep the legacy sheet name.
- Why: The legacy sheet was named after a real invoice number (C1). Legacy code never renames the sheet, so goldens made with this template (H5) carry `Sheet1`.
- Reversible: yes.

### D-0281 — Templates embedded as a generated base64 module

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: `pnpm gen:templates` writes `packages/documents/src/templates.generated.ts`, checked by a freshness test. `templateBytes()` decodes with `atob`.
- Alternatives: Bundler `?inline` imports; read the files at runtime.
- Why: SPEC-12 §4.1 and C12 require bytes embedded at build and no `node:fs`, without tying the core package to a bundler. This follows the migrations generator.
- Reversible: yes.

### D-0282 — xlsx snapshot format

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: One entry per sheet: name, state, cells, sorted merges, columns, rows, page breaks and page setup. Cells are keyed by address with type, value and style; an empty border and a `none` fill are dropped, and rich text is recorded as its text. Columns and rows are `{ size?, hidden? }`. Page breaks come from the sheet XML. Page setup records all 12 keys, with Excel's default where the file omits one.
- Alternatives: Wait for the SPEC-01 PR 4 ADR (blocked on H5); compare bytes.
- Why: SPEC-12 PR 1 needs a format now. A writer that omits a default and one that writes it should compare equal. ADR 0003 can revise the format before SPEC-12 PR 2's goldens are committed.
- Reversible: yes; goldens are regenerated with the tool.

### D-0283 — SPEC-13 PR 1 re-scoped: goldens from the legacy code, H5 confirmation in PR 1b

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: The report goldens are derived from the legacy code's visible export output (headers, order, formats, merges, file names). A new row, SPEC-13 PR 1b (todo, H5), confirms them against real legacy output.
- Alternatives: Keep PR 1 blocked on H5.
- Why: H5 is unavailable; reading visible output is allowed by C16 and unblocks SPEC-13 PR 3–5.
- Reversible: yes.

### D-0284 — Report golden format

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: A report workbook golden is compact JSON: file name, sheet, widths, page setup, footer, named exceljs styles, merges and a cell grid of `value` or `{ v, s }`; a merged range carries its top-left cell's style. A CSV golden is exact bytes.
- Alternatives: The SPEC-12 xlsx snapshot format (D-0282).
- Why: The goldens are written by hand and must be readable; SPEC-13 PR 3 projects writer output onto this shape.
- Reversible: yes.

### D-0285 — Fixed column widths in list workbooks

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: Each list-workbook column has a fixed width: header length + 2 and at least 12, 30 for names, 60 for descriptions. Legacy fitted each column to its longest value, at most 60.
- Alternatives: Two passes, or a max-length query before streaming.
- Why: The streaming `WorkbookWriter` writes column widths before the first row (INV-99). Widths are not cell content, so this is a minor visual change that C7 allows for performance.
- Reversible: yes.

### D-0286 — Export file names are the legacy server's

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: `PO_Register.xlsx`, `DC_Register.xlsx`, `Invoice_Register.xlsx`, `Items_Summary[_<from>_to_<to>].xlsx`, `PO_Reconciliation_Report.xlsx`, `PO_Reconciliation_<po>.xlsx`, `GC_<dc>.xlsx`, `Delivery_Tracker_<YYYYMMDD>_<HHMM>.xlsx` (IST), `DC_List_Export_<po or All>.csv`, `Invoice_List_Export.csv`; numbers cleaned as legacy did (`..`, `/`, `\` to `_`, at most 50 characters).
- Alternatives: The legacy browser's fallback names (`<type>_report.xlsx`, `Selected_Summary.xlsx`).
- Why: SPEC-13 §2 names the date-range variant, which only the server produced; D-0006 keeps the `.csv` names.
- Reversible: yes.

### D-0287 — CSV exports start with a UTF-8 BOM

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: CSV exports start with a UTF-8 BOM, as the legacy CSV writer did; CRLF line ends and minimal quoting stay. Supersedes D-0261's no-BOM choice; SPEC-13 PR 3 adds the BOM in `csvChunks`.
- Alternatives: No BOM (D-0261).
- Why: D-0261 chose no BOM only because no golden existed and left the goldens to confirm or change it; the legacy output has the BOM.
- Reversible: yes.

### D-0288 — CSV numbers without a trailing `.0`

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: CSV numbers are plain decimals (`11`, `1.25`); legacy wrote Python's `str(float)` (`11.0`).
- Alternatives: Reproduce `11.0`.
- Why: A spreadsheet reads both as the same cell value; the `.0` is a float artefact, as in D-0055.
- Reversible: yes.

### D-0289 — Edge-case readings EC-39 to EC-45

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: EC-39 (DC list Status, Pending Qty) and EC-40 (invoice list Delivered Qty, Status, Pending Qty) as legacy, through the resolved SRV links; EC-41 packets 0 and an empty description row; EC-42 one-PO reconciliation as item rows; EC-43 export-selected as the selected POs' reconciliation rows (D-0100); EC-44 the install's supplier name; EC-45 the bare `Report` sheet.
- Alternatives: Per row in EDGE_CASES.md.
- Why: C18. In the synthetic dataset the EC-39 legacy formulas agree with the item balance, so `dc-list.csv` holds under either reading; the other goldens depend on their readings: `invoice-list.csv` on EC-40, `pending.json` on EC-41, `reconciliation-one-po.json` on EC-42, `export-selected.json` on EC-43, `po-register.json` on EC-44, `po-register-empty.json` on EC-45.
- Reversible: yes.

### D-0290 — PO preview lists every item

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The PO preview returns every PO item with `qty: null`, including items whose `uninvoicedQty` is 0 or negative.
- Alternatives: The legacy filter (only items with uninvoiced > 0) with qty prefilled.
- Why: INV-05 and C6: uninvoiced is shown, never enforced, and the shared schema says `qty` is `null` from a PO; hiding items would be a cap.
- Reversible: yes.

### D-0291 — Invoice preview header defaults

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: Both previews fill the supplier snapshot from the supplier row, `buyersOrderDate` = PO date and `gemcNumber` from the PO. The PO preview also fills `remarks` from the PO. The DC preview fills the buyer name, GSTIN and address from the DC's consignee, and `vehicleNo`, `lrNo`, `transporter` and `remarks` from the DC. Every other field is blank, including the PO preview's buyer (EC-46).
- Alternatives: Buyer from `po.buyer_id`, which no flow sets.
- Why: C16 and C18: match the visible legacy output where v1 stores the field, without inventing.
- Reversible: yes.

### D-0292 — DC preview of an invoiced DC is a 409

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The DC preview answers 409 `dc-has-invoice` once the DC has an invoice.
- Alternatives: Return the preview anyway.
- Why: Legacy refuses it, and the create would answer 409 (INV-28).
- Reversible: yes.

### D-0293 — DC preview lines in the DC's order

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The DC preview lists the lines in the DC's order, as the create stores them (D-0272).
- Alternatives: PO item order.
- Why: The form shows what will be saved.
- Reversible: yes.

### D-0294 — PO-direct create: 404 for the PO before 400 for the lines

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The lines are checked against the PO's items, read after the PO version (D-0220), so an unknown PO is a 404 and malformed lines on a known PO are a 400.
- Alternatives: Check line shape before reading the PO.
- Why: Membership needs the items, and one check order is simpler.
- Reversible: yes.

### D-0295 — Invoice audit lines carry both line ids

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: Audit `after.lines` carries `poItemId` and `dcItemId` for both invoice kinds.
- Alternatives: A per-kind shape.
- Why: One shape; a PO-direct line has no DC line.
- Reversible: yes.

### D-0296 — EC-13 and SPEC-11 §6 clarified

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: Both now read: dsp 20, `OVER_DISPATCH`; `OVER_INVOICE` only once the DC is invoiced too (invoiced 20 > ord 10, INV-55). No code change; tests cover both cases with literal values.
- Alternatives: Leave the text and test only the invoiced case.
- Why: The old text contradicted INV-55.
- Reversible: yes.

### D-0297 — SPEC-12 PR 3 re-scoped: goldens from the legacy code

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: The DC goldens are derived from the legacy DC writer's visible output, read from its code (C16). SPEC-12 PR 2 (H5) confirms them against real legacy output and fixes any difference.
- Alternatives: Keep PR 3 blocked on H5.
- Why: H5 is unavailable; same approach as SPEC-13 PR 1. Unblocks PR 4 to PR 6.
- Reversible: yes.

### D-0298 — Supplier description and jurisdiction come from `invoiceDefaults`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: The DC/GC letterhead description is `supplier.invoiceDefaults.description`, the invoice jurisdiction `supplier.invoiceDefaults.jurisdiction`; a missing key leaves the text empty. A document's own supplier name, address, GSTIN and contact win over the profile's when set and not blank (`documentSupplier`).
- Alternatives: A new `supplier` column; a `settings` row as legacy had.
- Why: The most conservative reading named in D-0279: no schema or API change, and `settings` holds GST percentages and preferences, not identity.
- Reversible: yes.

### D-0299 — DC golden format

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Each golden is compact JSON: file name, page setup, every non-empty value, sorted merges, row heights and hidden rows, and `styleRows` segments naming the template row each output row takes its cell styles from. Tests project `xlsx-snapshot` output onto it; column widths and the empty sheets are checked against the template.
- Alternatives: A full `xlsx-snapshot` dump per golden.
- Why: A full dump repeats every template style per row and can't be reviewed; these goldens are hand-derived.
- Reversible: yes.

### D-0300 — The legacy DC row-height layout is reproduced

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Rows inserted for items past the eighth shift the cells and merges below but not the row heights, as legacy's openpyxl `insert_rows` did. Past eight items the template's hidden spacer row shows, and rows below the template's last row print at the default height.
- Alternatives: Move heights with their rows.
- Why: The output is frozen (A-2, INV-69); H5 compares against legacy output.
- Reversible: yes.

### D-0301 — Legacy DC text not described by the spec

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Reproduced exactly (SPEC-12 §9): `GST Bill No. <invoice> Dt.`, `Guarantee Certificate No. <gc>   Dt. <date>` (three spaces; INV-36 paraphrases it with one), `Dimension Report <our ref>`, `TC No  dt.  Of`, `Lot No.`, `Consignment Value of BHEL PO <value>`, `<invoice>  Dt.`, `Date: <dd/mm/yyyy>`, `Consignee` when there is none, `<qty>  <UNIT>` (upper-cased, `NO` when missing); an item row grows 18 points per 95 description characters.
- Alternatives: None that keeps the format frozen.
- Why: The format is frozen; these are the strings legacy wrote.
- Reversible: yes.

### D-0302 — DC department number prints as a number when it is all digits

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: A digits-only `departmentNo` that is a safe integer is written as a number cell (`0456` -> 456); other text stays text.
- Alternatives: Always text.
- Why: Legacy's column was INTEGER, so SQLite stored digit-only values as numbers.
- Reversible: yes.

### D-0303 — DC consignment value is exact, rounded per line

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: `sumMoney(items.map(qtyValue))`, as the API's DC list computes it, printed with `fmtFixed` (2 dp, 5 dp on GEMC). Legacy summed floats; the two differ only on exact half-cent ties, where D-0021 rounds half away from zero.
- Alternatives: Re-implement float summing.
- Why: C3; the same value the DC list shows.
- Reversible: yes.

### D-0304 — Empty text cells; `autoPageBreaks` not written

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Where legacy wrote `""` the cell is left empty, and filled placeholder text is right-trimmed (legacy stripped `Tel. No. `). Legacy's `autoPageBreaks=False` flag is not written: exceljs has no setting for it, it only changes on-screen break display, and the snapshot doesn't record it.
- Alternatives: Write empty strings; post-process the sheet XML.
- Why: No visible difference; SPEC-12 PR 2 (H5) shows whether the snapshot needs them.
- Reversible: yes.

### D-0305 — SPEC-12 §4.1 golden file names clarified

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: SPEC-12 §4.1 and the PR 2 row now name the goldens `test/golden/<document>-<n>.json` (for example `dc-20.json`) in the D-0299 format, replacing `*.snapshot.json`.
- Alternatives: Rename the files to `*.snapshot.json`.
- Why: They are not `xlsx-snapshot` dumps (D-0299); the name should not suggest one. PR 4 and PR 5 follow it.
- Reversible: yes.

### D-0306 — Invoice edit and delete guard the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: Invoice edit and delete batches include `updateWithVersion(po, poId, versionRead, {})`, with the version read in the same statement as the invoice (`findInvoiceWithPo`). An edit also guards every other PO it recomputes. A stale PO is retried (3 attempts); a stale invoice on edit is a 409.
- Alternatives: Guard only the invoice version, which lets an edit racing a delete write an audit row for a deleted invoice.
- Why: The same rule as D-0264 for DCs.
- Reversible: yes.

### D-0307 — Invoice delete fails its batch if an SRV link appears before commit

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: The delete batch starts with `invoiceStillUnlinked` (`version = CASE WHEN <linked SRV item> THEN NULL ELSE version END`). The delete retries on a stale `invoice`, and the retry answers 409 `delete-blocked` with `details.reason: "invoice-linked-srv"`.
- Alternatives: No guard (there is no foreign key on `srv_item.resolved_invoice_id`).
- Why: INV-35 must hold when an SRV ingest commits between the read and the commit (D-0124, D-0265).
- Reversible: yes.

### D-0308 — Invoice edit re-links only when the number or FY moves, and recomputes every PO whose links change

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: As D-0266 and D-0267 for DCs: no re-resolution when the trimmed number and the FY are unchanged; otherwise every PO owning an SRV item whose link changes is recomputed in the same batch.
- Alternatives: Re-resolve on every edit, or recompute only the invoice's PO.
- Why: Links resolve by `(number, FY)` (INV-24), and EC-14 flags the SRV item on its own PO.
- Reversible: yes.

### D-0309 — Invoice list columns, filters and order

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision:
  - Row values: `itemCount` = the invoice's line count, `qty` = `sumQty` of the line quantities (legacy `total_items`, `total_ord_qty`); `taxable` and `total` are the stored header amounts.
  - Filters: `q` matches the invoice number, PO number, DC number or buyer name, as the legacy `_build_where_filters` does. The date range applies to `invoice_date`, and the value range to the stored `total` (inclusive, in SQL).
  - Order: newest first by date desc, number desc (numeric), id desc. Sorting is done in memory with `paging.ts`.
- Alternatives: The legacy default `created_at DESC`.
- Why: C7 and C18 freeze the legacy columns and filters; the default order matches the DC list (D-0268) so both lists open the same way.
- Reversible: yes.

### D-0310 — Invoice KPI cards

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: `stats` uses the list filters and gives count, Σ total, Σ taxable and Σ(CGST + SGST + IGST) over the stored amounts, summed with the domain's `sumMoney`. No tax is recomputed.
- Alternatives: Unfiltered totals (legacy `get_stats`).
- Why: The legacy list page shows the filtered stats (`get_filtered_stats`); the amounts were computed once by the domain at creation (INV-41).
- Reversible: yes.

### D-0311 — Invoice detail flags and SRVs

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: `flags` are the open flags on the invoice's lines (`invoice_item`); `srvs` are the SRVs with an item whose `resolved_invoice_id` is the invoice (INV-37).
- Alternatives: Match `invoice_no` text without the FY.
- Why: The same as D-0269 for DCs: links are FY-qualified and stored resolved.
- Reversible: yes.

### D-0312 — DC and invoice writes share `services/doc-writes.ts`

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: `relink`, `guardedRecompute`, `otherPos`, `loadPo` and `commit` move out of `dc.ts` into one module keyed by the citation kind; invoice create, edit and delete use them.
- Alternatives: Copy them into `invoice.ts`.
- Why: The D-0220 guard and the link remap live in one place (invoice create previously had its own copy).
- Reversible: yes.

### D-0313 — Lists and exports read one keyset order

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `listKey` builds the key (the chosen sort, then the default order, then the id) and `pageOfRows` counts the rows and keeps one page. The pending and reconciliation lists and the tracker list read rows this way; the tracker list moves from the in-memory comparator sort onto it, keeping D-0241's order. A default part the chosen sort already has is dropped.
- Alternatives: Keep in-memory sorting for lists and keyset only for exports, then test that they agree.
- Why: A list's rows equal its export's rows by construction (SPEC-13 PR 5's done-when).
- Reversible: yes.

### D-0314 — Lists read in 5,000-row keyset pages

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `LIST_READ_PAGE = 5000`; exports keep the 500 default.
- Alternatives: `COUNT(*)` plus an OFFSET page (only possible where nothing is filtered in JS).
- Why: One query for an ordinary list, as before; bounded memory past that.
- Reversible: yes.

### D-0315 — Report rows carry the export columns

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `zPendingRow` and `zReconciliationRow` gain `poItemNo` and `poDate`; pending gains `unit` and reconciliation gains `balanceQty`.
- Alternatives: Keep the SPEC-04 shapes, so exports could not be built from the list rows.
- Why: SPEC-13 §2: the lists have the same columns as the exports.
- Reversible: yes.

### D-0316 — Reconciliation range defaults to the 30 days to today

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: Without both `from` and `to`, the range is today − 30 to today. With `poId`, the range is ignored.
- Alternatives: No default, which would list every PO.
- Why: C18: the legacy tab's behaviour where the spec is silent.
- Reversible: yes.

### D-0317 — Pending means balance > TOL, tested in SQL

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `balance_qty > TOL`, i.e. `gtTol(balance, 0)` (INV-02), legacy's `> 0.001`.
- Alternatives: Test in JS after reading every dated item.
- Why: Items with nothing to supply are never fetched, and the tolerance still comes from the domain.
- Reversible: yes.

### D-0318 — Report default orders

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: Pending: PO number as a number, then item number. Reconciliation: PO date newest first, then PO number and item number. Both break ties on the item id, and a chosen sort goes first.
- Alternatives: Legacy's single sort column with no tie-break.
- Why: Matches the goldens and gives stable pages.
- Reversible: yes.

### D-0319 — Tracker pending-value sort key is a REAL product

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: Sort by `CAST(balance_qty AS REAL) * rate_u5` in SQL, used only for ordering; the value shown is `qtyValue`.
- Alternatives: An integer product (can pass 2^63, and comes back to the cursor inexactly past 2^53); a stored pending-value column (a schema change).
- Why: The export streams in SQL order (INV-99).
- Reversible: yes.

### D-0320 — Pending documents and GEMC numbers

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: A row's DCs and invoices are those with a line on the item, oldest first. Its GEMC numbers are the item's invoices' distinct non-blank numbers, else the PO's.
- Alternatives: None in the spec.
- Why: The legacy pending query does this.
- Reversible: yes.

### D-0321 — IST date and minute helper beside the Clock port

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `istDateTime(instant)` and `IST_OFFSET_MINUTES` in `ports/clock.ts`. The node clock's `today()`, `istDayStart` and the tracker file name use them; one clock reading names the file and dates its rows.
- Alternatives: A `nowIst()` port method, which every fake clock would need.
- Why: The tracker file name needs the IST minute, and the offset lives in one place.
- Reversible: yes.

### D-0322 — Days Overdue wording

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `N days overdue`, `Due Today`, `Due in N days`, always plural, as legacy (`fmtDaysToDue`).
- Alternatives: Singular for one day.
- Why: Frozen export text (INV-68).
- Reversible: yes.

### D-0323 — One synthetic dataset for the cross-flow suite

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 6 (#67) · Status: decided
- Decision: Read "one synthetic dataset" as one dataset definition (`dataset()`), rebuilt fresh for each flow, plus one lifecycle test that chains DC, invoice, SRV and the guarded deletes on one PO.
- Alternatives: One shared mutable dataset that the tests walk through in sequence.
- Why: Each test stays independent of order; the lifecycle test still covers how the flows interact.
- Reversible: yes.

### D-0324 — SPEC-12 PR 4 re-scoped: goldens from the legacy code

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided (orchestrator)
- Decision: As D-0297, for the invoice: the goldens are derived from the legacy invoice writer's visible output (C16); SPEC-12 PR 2 (H5) confirms them.
- Alternatives: Keep PR 4 blocked on H5.
- Why: H5 is unavailable.
- Reversible: yes.

### D-0325 — Invoice golden format: number formats and copied fonts

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Invoice goldens add `numFmts` (`[first, last, columns, format]`) and `fontFrom` (cell -> template cell) to D-0299's `styleRows`; the golden checks are shared in `test/golden.ts`.
- Alternatives: List every formatted cell; a full snapshot dump.
- Why: Legacy sets formats per cell over the copied styles; ranges keep the goldens reviewable.
- Reversible: yes.

### D-0326 — The legacy invoice row layout is reproduced

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: An inserted item row takes the last template item row's styles, B:H merge and height; rows below keep the height of their row number (as D-0300). Up to three items, one blank item row shows under them and the rest are hidden.
- Alternatives: Move heights with their rows.
- Why: The output is frozen (A-2, INV-69).
- Reversible: yes.

### D-0327 — Legacy invoice text not described by the spec

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Reproduced (SPEC-12 §9): `GEMC:- <no> Dt:-<dd-mm-yyyy>` (`GEMC:-  Dt:-` when not GEMC); `By Loading Vehicle`; `BUYER` with no buyer name; `No Description`; the unit as stored, `NO` when missing (not upper-cased); 1 packet per item, the item count as total; `Total Amount (In Words) :- …`, `CGST (in words)  : …`, `SGST (in words)  : …`; the supplier block in the GSTIN line's font.
- Alternatives: None that keeps the format frozen.
- Why: The format is frozen.
- Reversible: yes.

### D-0328 — Amount in words

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: `fmtAmountWords` (`packages/schemas`) ports legacy's words: Crore/Lakh/Thousand, `Hundred and`, `and Paise …` when paise > 0, paise rounded half up from the exact amount (D-0021; legacy rounded a float). Paise can reach `One Hundred` and 1000 crore or more throws, as in legacy (EC-49).
- Alternatives: Carry paise into rupees; extend past 999 crore.
- Why: Either changes visible output or invents a rule.
- Reversible: yes.

### D-0329 — Invoice number cells are exact; the invoice's own GST percentages

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Number cells hold the exact decimal of the stored integer (`Number(moneyToString(m))`) and formats round on screen; totals are `invoiceTotals` of the stored lines, the qty total `sumQty`; the rate cells print the invoice's `cgstPct`/`sgstPct`, where legacy read the current settings.
- Alternatives: Float sums; current settings; `moneyNumber` (2 dp).
- Why: C3; the percentages are copied onto the invoice at creation (A2-4), so the printed rates match its amounts.
- Reversible: yes.

### D-0330 — Invoice GEMC formats follow `po.isGemc`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: The 5-dp formats apply when the PO is GEMC, the flag the stored amounts were rounded by; legacy checked for a non-blank invoice GEMC number.
- Alternatives: The invoice's `gemcNumber`.
- Why: They agree whenever the GEMC number came from the PO (D-0291), and the format always matches the amounts' precision.
- Reversible: yes.

### D-0331 — Invoice items in PO item order

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Invoice lines print sorted by PO item number, like the DC.
- Alternatives: Insert order.
- Why: Legacy ordered them by a random UUID, so there was no order to keep.
- Reversible: yes.

### D-0332 — Invoice header date fallbacks

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: The challan date is the DC's, or the invoice date on a PO-direct invoice; the buyer's order date is the invoice's, else the PO date, as legacy.
- Alternatives: Blank.
- Why: The format is frozen.
- Reversible: yes.

### D-0333 — Invoice download name

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: `Invoice_<number>.xlsx` with the DC's sanitising rule (`documentFileName` in `layout.ts`), falling back to `Invoice_invoice.xlsx` as the legacy invoice route did.
- Alternatives: The DC's `export` fallback.
- Why: The legacy names differ.
- Reversible: yes.

### D-0334 — Blank invoice buyer prints `BUYER`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: The builder prints the invoice's stored buyer fields; a blank name prints `BUYER`, blank fields stay empty. Legacy's fallback to buyer settings and the default buyer row is not carried: v1 has no such settings and `buyer` has no address (EC-46).
- Alternatives: Fill from the `buyer` table in SPEC-12 PR 6.
- Why: The most conservative reading; no new data source.
- Reversible: yes.

### D-0335 — Export writers load on the first export

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: Services import only `@senstosales/documents/catalog` (a new subpath; type-only exceljs imports). The writers come in through a dynamic `import("@senstosales/documents")` when an export starts.
- Alternatives: A static import of the package index.
- Why: exceljs and the embedded templates added about 0.8 s to every API start (measured with services import timing) for a feature used on demand.
- Reversible: yes.

### D-0336 — Streamed downloads are a pull-based ReadableStream, not `hono/streaming`

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: A file handler may return `StreamedFile { fileName, chunks }`, served as a pull-based `ReadableStream` (highWaterMark 0): a source error fails the body and a client cancel closes the source.
- Alternatives: `hono/streaming`'s `stream()`, as ARCHITECTURE §11.2 names it.
- Why: That helper closes the body normally when the source throws, so a failed export arrives as a short file that looks complete, and it keeps draining the source after the client disconnects. SPEC-13 §4.3 wants a failed download. The plain stream is what the helper wraps, with no read-ahead.
- Reversible: yes, one function.

### D-0337 — The keyset tie-break is a typed primary key

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: `Keyset<Row> = { parts, id }`, with `id.by` a column branded `isPrimaryKey: true` (#58 review). One row per table row is still the caller's job; this is documented on `Keyset`.
- Alternatives: Only a test across a page boundary.
- Why: The compiler rejects a non-unique tie-break for every caller.
- Reversible: yes.

### D-0338 — List CSVs stream in the default order; a chosen sort holds the rows to sort them

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: Pages are read in the list's default order (date desc, number as a number desc, id desc). When the query names a sort, the filtered rows are collected and stable-sorted with the list's own comparators, so ties keep the default order.
- Alternatives: Computing totals in SQL so they can be keyset sort keys (would compute quantities outside the domain, C2).
- Why: Ordered/dispatched/received/value are domain totals. The screen already sorts the same rows in memory (D-0246, D-0268), and the default-order export is the INV-99 path.
- Reversible: yes.

### D-0339 — Register orders and filters

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: Each register is newest first by its date (PO date with no date last), then number as a number desc, then id desc, filtered on that date. PO register `items_count` counts every item row of the PO, `total_qty` is the stored PO ordered total, and `total_tax` is CGST + SGST + IGST. A DC register row with no lines shows 0 and 0; the DC list CSV leaves such a DC out, as the list does.
- Alternatives: Date only (an unstable order between equal dates).
- Why: The catalog records date newest first; the tie-breaks make pages total and match the lists.
- Reversible: yes.

### D-0340 — EC-39/EC-40 tolerance

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: The DC list Status uses the 0.001 tolerance EC-39 states (`gte` with `TOL`). The invoice list Status compares Delivered Qty ≥ invoice quantity exactly, because EC-40 states no tolerance.
- Alternatives: Tolerance on both.
- Why: C18, the EC text as written.
- Reversible: yes.

### D-0341 — The report dataset is a `@senstosales/documents` test subpath export

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: `"./test/reports/dataset"` in `packages/documents/package.json`, so API tests seed the same dataset the goldens were worked from.
- Alternatives: A fixtures workspace package; a copy in the API tests.
- Why: One dataset, no copy, no new package. The goldens are read from disk by path.
- Reversible: yes.

### D-0342 — Export number cells come from shared formatters

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: `qtyNumber(q)` and `moneyNumber(m)` in `packages/schemas/src/formatters.ts`, 2 dp half up in integer arithmetic (as `roundDiv`).
- Alternatives: Rounding in the writer per column.
- Why: D-0260 says services scale through the shared formatters, so screen and export agree.
- Reversible: yes.

### D-0343 — SPEC-00 §4.7 drops the `tools` required check

- Date: 2026-10-15 · Spec/PR: CodeAnt triage · Status: decided
- Decision: The ruleset's required checks are `check`, `licenses`, `real-data-scan`, then `build`, `audit`, `e2e`, `desktop` as each exists. `tools` is removed from SPEC-00 §4.7; the PR 1 row keeps its historical job list.
- Alternatives: Leave the spec as written (H1 applied from it would wait forever on a job nobody runs).
- Why: D-0018 folded the `tools` CI job into `check`; `ci.yml` has no `tools` job (CodeAnt on #10).
- Reversible: yes.

### D-0344 — Reviewers judge every CodeAnt inline finding

- Date: 2026-10-15 · Spec/PR: CodeAnt triage · Status: decided
- Decision: `/review-pr` §2.8: the reviewer waits for CodeAnt's review of the head commit, judges each inline finding (Nitpicks and PR Risk summaries skipped) with the same buckets as its own, and replies on each thread. A backfill triage of the 90 inline findings on merged PRs fixed the nine still valid (D-0343 among them) and logged two edge cases (EC-52, EC-53) in one PR.
- Alternatives: A merge-script check for unanswered bot threads (a second gate on a third-party bot's comment format).
- Why: Findings were triaged only when an agent happened to read them; CodeAnt caught defects our review missed (#37, #40, #50).
- Reversible: yes.

### D-0345 — SPEC-12 PR 5 re-scoped: goldens from the legacy code

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 5 (#73) · Status: decided (orchestrator)
- Decision: As D-0297 and D-0324, for the GC: the goldens are derived from the legacy GC writer's visible output (C16); SPEC-12 PR 2 (H5) confirms them.
- Alternatives: Keep PR 5 blocked on H5.
- Why: H5 is unavailable.
- Reversible: yes.

### D-0346 — The GC is built from the DC inputs

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 5 (#73) · Status: decided
- Decision: `GcDocument` is a subset of `DcDocument` (supplier; DC number, dates, GC number and date, consignee; PO number and date; items), and the GC goldens `gc-N` are built from `inputs/dc-N.json`.
- Alternatives: Separate `gc-N` input files copying the DC ones.
- Why: Legacy printed the GC from the same DC detail data; one input set keeps H5 to one run per count.
- Reversible: yes.

### D-0347 — Legacy GC text and layout not described by the spec

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 5 (#73) · Status: decided
- Decision: Reproduced (SPEC-12 §9): `<gc>  dt. <dd/mm/yyyy>`, `<po>  dt. <date>`, `<dc>  dt. <date>` in I9–I11, trimmed (`<po>  dt.` with no PO date); the guarantee text with `24 Months` (legacy overwrote the template's `24 Month`); `For <supplier name>` after 17 spaces; `<qty>  <UNIT>` in column J; unused item rows stay visible; item rows grow 17 points per 95 description characters; always `fitToHeight: 0`; print area `B1:J<34 + inserted rows>`.
- Alternatives: None that keeps the format frozen.
- Why: The format is frozen (A-2, INV-69).
- Reversible: yes.

### D-0350 — Empty text cells in the pending summary are styled blanks

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: A `""` value is written as a blank cell with its style; `pending.json` records these cells as `"v": null`, and the golden projection allows `{ v: null, s }`.
- Alternatives: Keep `""` in the golden.
- Why: Legacy's xlsxwriter writes an empty string as a formatted blank, and exceljs reads an empty string cell back as null.
- Reversible: yes.

### D-0351 — Print options for streamed sheets

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: `addStreamedSheet` writes `<printOptions>` from the page setup (centring, grid lines, headings) through exceljs's private `_writePageMargins`/`_write`; re-check when exceljs is bumped (#75 review).
- Alternatives: Build the summary in memory with the non-streaming workbook (breaks INV-99).
- Why: exceljs 4.4's `WorksheetWriter` never writes print options, and the summary is horizontally centred; the pending golden pins the output.
- Reversible: yes.

### D-0352 — Pending summary numbers and text as legacy

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: The quantity text (`10 NOS`), Dispatch Delivered and the TOTAL are exact to 3 dp; a missing description falls back to the material code, then `No Description`; lists are joined with `,`.
- Alternatives: The list workbooks' 2-dp rounding.
- Why: The legacy summary wrote the raw values and `COALESCE(description, material_code, 'No Description')`.
- Reversible: yes.

### D-0353 — Export-selected selection handling

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: A PO selected twice is written once and an unknown id is skipped; POs are ordered by number with the lists' numeric comparison, each PO's items read with the `BY_PO_NUMBER` keyset.
- Alternatives: 404 on an unknown id.
- Why: Legacy ignored ids it did not find; C6 allows rejecting unknown ids only at document creation.
- Reversible: yes.

### D-0354 — Not-found answers for the one-PO and GC exports

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: An unknown `poId` on the reconciliation export answers 404 `po-not-found`, an unknown `dcId` on the GC report 404 `dc-not-found`; with no supplier yet the GC report answers `onboarding-required`.
- Alternatives: An empty workbook.
- Why: The file name needs the PO or DC number.
- Reversible: yes.

### D-0355 — Downloads are typed by their file extension

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 6 (#76) · Status: decided
- Decision: `sendFile` sets `Content-Type` from the download name: Hono's media types plus xlsx, else `application/octet-stream`. OpenAPI keeps the generic `application/octet-stream` (D-0117).
- Alternatives: `application/octet-stream` for every file; a content type in each handler's result.
- Why: SPEC-12 PR 6 asks for the right content type, and the name already names the format.
- Reversible: yes, one function.

### D-0356 — The Excel document reads are their own queries

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 6 (#76) · Status: decided
- Decision: `dcForDocument`/`invoiceForDocument` (`repositories/documents.ts`) join the PO's number, date and GEMC flag, a DC's invoice number and an invoice's source DC; `findDcWithPo`/`findInvoiceWithPo` are unchanged.
- Alternatives: Add `poDate` to those finders.
- Why: They carry the PO version for write guards and feed the detail API; the documents need different columns.
- Reversible: yes.
