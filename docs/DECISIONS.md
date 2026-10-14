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

| ID     | Title                                                  | Status        |
| ------ | ------------------------------------------------------ | ------------- |
| D-0003 | BHEL buyer seed: none                                  | pending-owner |
| D-0004 | Initial password `admin`, no forced change             | pending-owner |
| D-0005 | Cell safety applies to text cells only                 | pending-owner |
| D-0006 | DC and invoice list exports named `.csv`               | pending-owner |
| D-0007 | Downloads are not logged                               | pending-owner |
| D-0008 | Minimal Rust Tauri scaffold outside the language check | pending-owner |
| D-0009 | Money rounding: half-up                                | pending-owner |

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

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 5 · Status: pending-owner
- Decision: The seed holds no buyer rows; the user adds BHEL units through the buyers settings (legacy UI).
- Alternatives: Seed a full public list of BHEL units with their GSTINs allowlisted in the real-data scan.
- Why: C1 forbids GSTINs in the repo, and seeding only the units one supplier deals with would identify it (SPEC-05 Open issues).
- Reversible: yes — a later seed migration can add the public list.
- Owner answer: —

### D-0004 — Initial password `admin`, no forced change

- Date: 2026-10-14 · Spec/PR: SPEC-07 PR 4 · Status: pending-owner
- Decision: First run uses the legacy default password `admin` with the legacy "default password" notice; it is changed in Settings, never forced (C11).
- Alternatives: Set a password during onboarding; force a change on first login (refused by C11).
- Why: Matches legacy behaviour; §10.3 does not say how the first password is set (SPEC-07 Open issues, SPEC-15 Open issues).
- Reversible: yes — an onboarding step can be added later.
- Owner answer: —

### D-0005 — Cell safety applies to text cells only

- Date: 2026-10-14 · Spec/PR: SPEC-13 PR 2 · Status: pending-owner
- Decision: Text values from users or BHEL pages are written as string cells (CSV text cells starting with `=`, `+`, `-`, `@` get a leading `'`); numeric values stay numeric with their legacy number formats (INV-94).
- Alternatives: Write every cell as a string, as §10.4 literally reads.
- Why: INV-68 freezes the legacy number formats; formulas can only enter through text (SPEC-13 Open issues).
- Reversible: yes — one writer function.
- Owner answer: —

### D-0006 — DC and invoice list exports named `.csv`

- Date: 2026-10-14 · Spec/PR: SPEC-13 PR 3 · Status: pending-owner
- Decision: The DC and invoice list exports keep their CSV content and get a `.csv` file name.
- Alternatives: Keep the legacy `.xlsx` name on CSV content; produce real xlsx.
- Why: The legacy name/content mismatch is a bug fix A-2 allows. ARCHITECTURE §11.2 does not list these exports yet; adding them is an owner edit (SPEC-13 Open issues).
- Reversible: yes — a file-name constant.
- Owner answer: —

### D-0007 — Downloads are not logged

- Date: 2026-10-14 · Spec/PR: SPEC-12 PR 6 · Status: pending-owner
- Decision: v1 writes no audit or ledger row for document or export downloads; the ledger screen shows the audit rows.
- Alternatives: Log download events as legacy did.
- Why: `audit_log` holds one row per write batch and a download is not a write (SPEC-12 Open issues).
- Reversible: yes — add an event write to the download routes.
- Owner answer: —

### D-0008 — Minimal Rust Tauri scaffold outside the language check

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 2, SPEC-20 PR 2 · Status: pending-owner
- Decision: `apps/desktop/src-tauri/` holds only the generated minimal Tauri entry (`main.rs`, no logic); the INV-90 language check covers `packages/*/src`, `apps/{api,web}/src` and `apps/desktop/src`. Sidecar control lives in TypeScript.
- Alternatives: Extend the language check to `src-tauri/` (fails on the required Rust entry); allow Rust logic in the shell.
- Why: Tauri 2 needs a Rust entry; keeping it a scaffold keeps all logic in TypeScript (SPEC-00 Open issues, SPEC-20 Open issues).
- Reversible: costly — a different shell would replace SPEC-20.
- Owner answer: —

### D-0009 — Money rounding: half-up

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 · Status: pending-owner
- Decision: `round2`/`round5` round exact ties half-up on the exact integer result.
- Alternatives: Half-even (banker's rounding).
- Why: The spec does not state the tie rule; half-up is the conservative reading. SPEC-12 invoice goldens from legacy output are the arbiter; a mismatch is escalated, not silently changed (SPEC-03 Open issues).
- Reversible: yes — one domain function and its table tests.
- Owner answer: —

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
- Why: A pixel match would make every shadcn/ui default a deviation (D-0015) with no benefit to users. ARCHITECTURE §1, §2 C7, §12.2 and A-2 (rev 1.2), CLAUDE.md C7, INV-66, INV-67, `docs/specs/README.md` and SPEC-14 updated.
- Reversible: yes — reword C7 back.
- Owner answer: Owner decision, 2026-10-14.
