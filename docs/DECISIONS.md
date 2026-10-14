# Decisions log

Agents log the decisions they make while writing specs and implementing them. Owner decisions belong in
ARCHITECTURE Appendix A; open owner questions belong in OPEN_QUESTIONS.md. What goes here and when to escalate:
`CLAUDE.md` §4–§5. While an orchestrator runs, workers put decisions in their PR body and the implementor copies
them here in its tracker commit on `YOUR TURN`, under the IDs the orchestrator sends (`CLAUDE.md` §3).

**Statuses:**
- `decided`: made by an agent within its authority. Stands unless the owner overrides it.
- `pending-owner`: a default an agent chose that the owner should confirm. Work proceeds on it.
- `needs-owner`: blocking. Work that depends on it stops until the owner answers.
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

| ID | Title | Status |
|---|---|---|
| D-0003 | BHEL buyer seed: none | pending-owner |
| D-0004 | Initial password `admin`, no forced change | pending-owner |
| D-0005 | Cell safety applies to text cells only | pending-owner |
| D-0006 | DC and invoice list exports named `.csv` | pending-owner |
| D-0007 | Downloads are not logged | pending-owner |
| D-0008 | Minimal Rust Tauri scaffold outside the language check | pending-owner |
| D-0009 | Money rounding: half-up | pending-owner |

---

## Entries

### D-0001 — No release-age quarantine; trust policy no-downgrade
- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 1 · Status: confirmed
- Decision: `pnpm-workspace.yaml` sets `minimumReleaseAge: 0` with `trustPolicy: no-downgrade` (`trustPolicyIgnoreAfter` one year). There is no `.npmrc` release-age setting.
- Alternatives: pnpm's one-day default quarantine; a longer `minimumReleaseAge`.
- Why: Vite+ ships new dependency versions that a quarantine blocks; `no-downgrade` still refuses a release whose provenance or signature weakens. SPEC-00 §4.2 updated to match.
- Reversible: yes — change two settings in `pnpm-workspace.yaml`.
- Owner answer: Owner decision, 2026-10-14.

### D-0002 — Toolchain: Vite+ (Oxlint, Oxfmt, Vitest), TypeScript 7, no ESLint or Prettier
- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 1 · Status: confirmed
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
