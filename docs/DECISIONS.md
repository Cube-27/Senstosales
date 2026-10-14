# Decisions log

Agents log the decisions they make while writing specs and implementing them. Owner decisions belong in
ARCHITECTURE Appendix A; open owner questions belong in OPEN_QUESTIONS.md. What goes here and when to escalate:
`CLAUDE.md` §4–§5. While an orchestrator runs, workers put decisions in their PR body and the implementor copies
them here in its tracker commit on `YOUR TURN`, under the IDs the orchestrator sends (`CLAUDE.md` §3).

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
