---
name: edit-docs
description: Rules for changing the project documents - docs/ARCHITECTURE.md, docs/OPEN_QUESTIONS.md, specs in docs/specs/, docs/INVARIANTS.md, the tracker docs/plans/ACTIVE.md, and the decisions log (docs/DECISIONS.md, docs/decisions/). Invoke before editing any of them.
---

# Editing the project documents

- `ARCHITECTURE.md` and `OPEN_QUESTIONS.md` change only with owner approval. When approved, add a revision-log row and keep
  the specs consistent in the same change.
- Specs follow one template (`docs/specs/README.md`). Clarifying edits that don't change the architecture are
  allowed and logged in the spec's decisions file.
- A spec that adds an invariant appends its row to `docs/INVARIANTS.md`. Invariants are never removed.
- `ACTIVE.md`, `DECISIONS.md` and `docs/decisions/` are working documents: current, short and factual. In
  `ACTIVE.md`, a spec whose rows are all done collapses to one line under "Done specs"; its open notes move to
  "Follow-ups" unless a row not done already carries them.
