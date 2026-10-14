# SPEC-22 — Cutover

Layer: L9. Architecture refs: §1 (goals 4, 6), §7.4, §15 (L9); A-6, A-19.

## 1. Summary

Move the owner from the legacy app to the new one: install, onboard (supplier profile and GST rates typed in at
first run; nothing read from the legacy DB), import the PO and then SRV HTML corpus through folder import, review the
import report, then work in the new app. The legacy app is retired after the owner signs off. Live data has no DCs
or invoices to carry over (owner decision); none are migrated.

## 2. Scope

Core:
- A "Moving from the previous app" section in `docs/OPERATIONS.md`: the steps above, in plain language.
- Fresh corpus import on the owner's machine with the release build; the SPEC-09 report reviewed by the owner
  (kept private).
- Sign-off and retirement recorded in DECISIONS (no real data).

Out of scope:
- Reading or diffing the legacy database (A-6); parallel-run diff tooling.

## 3. Dependencies

- SPEC-09, SPEC-13, SPEC-17, SPEC-18, SPEC-19, SPEC-20, SPEC-21.
- Human tasks: H8 (owner cutover and sign-off).

## 4. Design

No code. Procedure and records only.

## 5. Invariants

INV-49 (no legacy DB input), INV-74 (nothing from the cutover enters the repo).

## 6. Testing strategy

The procedure is rehearsed on a VM with the anonymised fixture folders before the owner runs it on real data.

## 7. Acceptance criteria

- [ ] The owner works in the new app after a fresh corpus import (L9 exit).
- [ ] The legacy app is retired; the decision is recorded.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | Cutover procedure | "Moving from the previous app" section in `docs/OPERATIONS.md` | `real-data-scan` | Rehearsed on a VM with fixture folders. |
| 2 | Fresh import and review (human) | DECISIONS entry (outcome only) | — | Owner imports the corpus with the release build and accepts the private report. |
| 3 | Sign-off and retirement (human) | DECISIONS entry | — | Owner works in the new app; legacy retired. |

## 9. Open issues

- None.
