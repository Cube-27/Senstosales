# Engineering principles

How agents write code in this repo. `CLAUDE.md` §2 (the contract) outranks this file: where they seem to conflict,
the contract wins. Agents read this once per session.

Adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (MIT; see `NOTICE`).
Selected and rewritten for this project.

## Verification

**Prove it works.** Check the real thing, not a proxy. "It compiles", an agent's self-report and a cached result
are not evidence. The strongest proof is a check anyone can re-run: a test, a replay, a measured delta. When a
check fails, suspect the check before the system.

**Sequence verifiable units.** Work in small units, each ending in a state you can check. Don't start the next unit
until the current one is green. In git history, the failing test comes first and the fix sits on top.

**Test behaviour, not implementation.** A test calls the code the way its users do and asserts the exact result.
Delete or rewrite any test that would still pass if the function returned a wrong value: loose assertions
(`is not None`, `> 0`, "doesn't throw"), call-only mocks, expected values computed by the code under test,
restated constants. Prefer property tests for parsers and normalizers.

**Explain the number.** Every reported metric says what bounds it and what else it could be measuring. A result
reported without its n is not a result.

## Changing code

**Fix root causes.** Reproduce first. Ask "why" until you reach the cause, and fix it there. Never add a guard that
silences a symptom. If a workaround needs a paragraph of comment to justify it, the code is wrong. Fix the _class_
of failure, not just the instance.

**Attack the premise.** When two fixes resting on the same assumption fail the same check, stop fixing. Write the
assumption down and test it.

**Subtract before you add.** Default to removing complexity. Design for observed failures, not speculative ones.
Add no validators, parsers, guards or options beyond what the spec asks for. Build no candidate without evidence.

**Minimize reader load.** What matters is how much a reader must trace and hold in their head. Extract named steps,
replace branch chains with dispatch tables, split modules by responsibility. Inline wrappers with one caller and
adapters with no second implementation (ports for hosting are the exception the architecture names). A new reader
should answer "where does X come from, and what can change it?" in 30 seconds.

**Migrate callers, then delete.** When an internal API changes, move every caller in the same PR and delete the
old path. No compatibility shims for internal code.

## Structure

**Boundary discipline.** Validate and parse at system boundaries: HTTP requests, CLI args, settings, DB rows, files,
model output. Typed results are the boundary. Inside, trust the types. Business logic lives in pure functions;
routes, workers and CLI commands are thin shells around them.

**Model the domain.** Put the domain in data structures instead of conditionals: result unions, state machines,
registries. One more branch on an existing if/else chain, or a second flag that must stay in sync with the first,
is the sign the model is missing.

**Type-system discipline.** Make impossible states unrepresentable: discriminated unions over bags of optionals,
branded IDs that must not mix, exhaustive matches (`never` / `assert_never`), types derived from their authority
(schema → client types, ORM → DB shape). No `any`, casts or ignores without a boundary check that justifies them.

**Make operations idempotent.** Jobs, migrations and scripts converge to the same state if they run twice or crash
halfway.

**Separate before serializing shared state.** Before two actors write one thing, ask whether they need to. Where
one shared target is a real invariant, serialize in structure (unique constraints, a single writer, locks), not by
convention.

## Working autonomously

**Never block on the human for reversible work.** Decide, proceed, and log the decision (`docs/DECISIONS.md`,
"Where an entry goes"). The exceptions are in `CLAUDE.md` §4: architecture changes, candidates, secrets, paid
accounts and irreversible actions are escalated, never decided.

**Own the exit condition.** Before starting, state "done" as a checkable predicate ("acceptance criteria 1–4 pass;
CI green"). Drive to it. A plateau is not a stop: change approach. Never relax the predicate to
declare victory. A real dead end, after three honest attempts, is escalated.

**Encode lessons in structure.** When the same mistake recurs, fix it with the strongest tool that works, in this
order: types, a lint or import rule, a CI check, a test. A sentence in a doc comes last.

## This project

**Port rules, never invent them.** Every business rule traces to `docs/INVARIANTS.md` (and from there to the legacy
business spec or an owner decision in `ARCHITECTURE.md` Appendix A). A rule with no `INV-NN` is a review blocker.
An uncovered business case goes to `docs/EDGE_CASES.md` with the spec's behaviour; never invent handling.

**Freeze the output, not the mechanism.** The UI/UX and CSV/Excel formats match legacy output exactly (golden
tests). How they are produced is new code: pick the simplest efficient way, never copy the legacy mechanism.

**Integer units.** Quantities are milli-units and money is 1e-5 units (ARCHITECTURE §6.1). No floats in the
domain; convert only at the boundary.

**Batch-shaped writes.** Every write is one batch through the `Db` port (D1 has no interactive transactions), and
derived values and flags are recomputed in the same batch.

**No layout shift.** No interaction moves or resizes anything around it: fixed table layout and widths, reserved page
height, a pager that stays put, loading/empty/error states with the content's footprint.

**No React effects.** Web code never uses `useEffect` or `useLayoutEffect` (owner rule; `vp lint` refuses both, as
imports and as `React.` members). Derive the value during render; act in the event handler that caused the change;
fetch and react to fetch results with TanStack Query (`meta.onSuccess`, or `meta.onError` for a failure toast) or a
Router loader; reset state with a `key`; read outside state with `useSyncExternalStore`. A DOM listener that lives as long as an element
goes in that element's ref callback, which returns its cleanup.

**No real data.** The repo is public. Fixtures are synthetic or anonymised; the real corpus is read from
`SENSTO_CORPUS_DIR` locally and never committed.

## Patterns the analysers flag

SonarCloud checks every PR; write these right the first time. Rules that misread this codebase are excluded, with
reasons, in `.sonarcloud.properties`.

- **Read-only props:** `({ title }: Readonly<CardProps>)`, not `({ title }: CardProps)`; inline prop types too.
- **No nested ternary:** an `if` chain, a lookup table or a named helper, not `a ? x : b ? y : z`.
- **No nested template literal:** hoist the inner part (`const note = n ? ": " + n : ""` as its own statement), then
  `` `Manual ${q}${note}` ``.
- **No needless async:** `() => Promise.resolve(x)` when nothing is awaited; keep `async` only where a throw must
  become a rejection.
- **No `void` or assignment inside an expression:** `(n) => { count = n; }`, not `(n) => void (count = n)`.
- **Escaped backslashes:** `` String.raw`C:\Windows` ``, not `"C:\\Windows"`.
- **Code points:** `codePointAt` and `String.fromCodePoint`, not `charCodeAt` and `fromCharCode`.
- **Clamps and lookups:** `Math.max(0, x)`, not `x < 0 ? 0 : x`; `list.includes(v)`, not `list.some((o) => o === v)`;
  `a?.[1]`, not `a && a[1]`.
- **Test assertions:** `expect(rows).toHaveLength(3)`, not `expect(rows.length).toBe(3)`; assert presence with
  `getBy*`, not `expect(queryBy*(…)).not.toBeNull()`.
- **Regexes on input from outside the repo:** no adjacent overlapping quantifiers (`\s*(.+);\s*$`); trim first, or use
  a negated class (`[^;]+`).
- **Components:** define them at module level, never inside another component's render.
- **Cognitive complexity:** split a function before it nests branches inside loops inside loops.
