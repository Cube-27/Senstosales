---
name: escalate
description: Record a question for the owner and move on. Invoke when CLAUDE.md §4 says to escalate - a change that would alter ARCHITECTURE.md or OPEN_QUESTIONS.md, build a candidate, needs credentials or a human, changes a public API or shared table beyond its spec, two specs contradict, or the same failure persists after three honest attempts.
---

# Escalate to the owner

1. Record a `needs-owner` decision in the decisions log (`docs/DECISIONS.md`, "Where an entry goes"): the question,
   the options, your recommendation, and what is blocked. Copy it as a row to `docs/OPEN_QUESTIONS.md`. This copy is
   the only change an agent makes to that file without owner approval.
2. A blocked row in `docs/plans/ACTIVE.md` becomes `blocked (D-NNNN)`.
3. Move on to the next piece of work. Don't wait idle; the owner answers asynchronously.
