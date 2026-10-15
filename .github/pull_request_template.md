<!-- One-minute briefing. Rules: CLAUDE.md §2 and CONTRIBUTING.md. -->

## Why

<!-- 1–3 sentences. Link the spec row: docs/specs/SPEC-NN-*.md §8, PR M. -->

## What changed

-

## Scope

<!-- What this PR covers, and what it deliberately leaves out. -->

## Verification

<!-- Real commands and their outcomes. Map each acceptance criterion of the row to the test or command that proves it. -->

## Decisions

<!-- Each decision in the docs/DECISIONS.md template's fields (no ID), marked `decided` or `needs-owner`; or "None". -->

## Bot findings

<!-- After the one bot pass (/implement-pr §6.1): each CodeAnt, CodeRabbit or SonarCloud finding not fixed, as `bot · path:line · rule — reason`; or "None". -->

## Checklist

- [ ] Every CLAUDE.md §2 rule holds for this diff.
- [ ] No candidate from the ARCHITECTURE candidates register implemented.
- [ ] Tests assert behaviour at the public interface; each would fail if the code returned a wrong value.
- [ ] No real data, secrets or customer names; fixtures are synthetic.
- [ ] No dependency under a denied licence; `NOTICE` updated for any adapted third-party material.
- [ ] New invariants appended to `docs/INVARIANTS.md`.
- [ ] Decisions recorded in the decisions log (`docs/DECISIONS.md`, "Where an entry goes"), or listed above for the orchestrator to record.
- [ ] Every business rule touched cites its `INV-NN`; uncovered edge cases recorded as `EC-NN` rows in `docs/EDGE_CASES.md` (C18), with the spec's behaviour implemented.
- [ ] Simplify pass ran (`/simplify`); no file over 800 lines, no function over complexity 15 (C15).
- [ ] A bug or finding that recurred now has a check or regression test, and a `docs/plans/RECURRING.md` row.
