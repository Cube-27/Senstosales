# SPEC-01 decisions

Decisions for [SPEC-01 — Spikes (L0.5)](../specs/SPEC-01-spikes.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0017 — Db port executors

- Date: 2026-10-14 · Spec/PR: SPEC-01 PR 3 (#5) · Status: decided
- Decision: Keep node:sqlite + `drizzle-orm/sqlite-proxy`. The `Db` port wraps Drizzle and exposes only `query` and `batch`. PRAGMAs are set by the node executor only. Migrations carry no transaction statements, and the SPEC-05 lint enforces the §8.3 allowlist. The node build checks the version with `user_version`; a D1 executor (K1) must read `schema_migration`. Batch statement shape is left to SPEC-05. Details: `docs/adr/0002-db-executors.md`.
- Alternatives: Expose Drizzle's `transaction()` (separate BEGIN/COMMIT, which C4 forbids and D1 refuses); mandate single-row batches now (hosted D1 limits unverified); `schema_migration` as the only version source now (the §13.3 wording would change).
- Why: Measured in the spike (ADR 0002 Results). Local D1 refuses `PRAGMA user_version`, `journal_mode`, `BEGIN` and `SAVEPOINT`, and accepts triggers and views.
- Reversible: yes — nothing is built yet; SPEC-05 implements it.

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
