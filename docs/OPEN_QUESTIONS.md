# SenstoSales — Open questions

Decisions only the owner can make. Each row has a recommended default, which `ARCHITECTURE.md` assumes until the
owner overrides it.

**v1 has no open questions.** Every v1 question is decided in `ARCHITECTURE.md` Appendix A (A1: owner decisions;
A2: questions closed by the spec or by frozen legacy behaviour). Items deferred past v1 do not belong here:
- edge cases the spec does not cover go to `EDGE_CASES.md`, with their v1 behaviour;
- mechanisms that might be built later go to the Candidates register (`ARCHITECTURE.md` §17).

This file changes only with owner approval, with one exception: an agent's `needs-owner` decision is copied here as
a new row, citing its `D-NNNN` (`CLAUDE.md` §5). Decisions agents make within their authority go in `DECISIONS.md`.
Resolved rows are struck through and say when and how: `~~question~~ **Resolved YYYY-MM-DD:** …`.

| # | Question | Why it matters | Recommended default |
|---|---|---|---|
