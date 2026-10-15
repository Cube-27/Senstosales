# SPEC-00 decisions

Decisions for [SPEC-00 — Repo bootstrap and engineering foundations](../specs/SPEC-00-repo-bootstrap.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0008 — Minimal Rust Tauri scaffold outside the language check

- Date: 2026-10-14 · Spec/PR: SPEC-00 PR 2, SPEC-20 PR 2 · Status: decided
- Decision: `apps/desktop/src-tauri/` holds only the generated minimal Tauri entry (`main.rs`, no logic); the INV-90 language check covers `packages/*/src`, `apps/{api,web}/src` and `apps/desktop/src`. Sidecar control lives in TypeScript.
- Alternatives: Extend the language check to `src-tauri/` (fails on the required Rust entry); allow Rust logic in the shell.
- Why: Tauri 2 needs a Rust entry; keeping it a scaffold keeps all logic in TypeScript (SPEC-00 Open issues, SPEC-20 Open issues).
- Reversible: costly — a different shell would replace SPEC-20.
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
