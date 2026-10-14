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
