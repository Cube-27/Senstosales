# Decisions log

Agents log the decisions they make while writing specs and implementing them. Owner decisions belong in
ARCHITECTURE Appendix A; open owner questions belong in OPEN_QUESTIONS.md. What goes here and when to escalate:
`CLAUDE.md` §4–§5. While an orchestrator runs, workers put decisions in their PR body and the implementor copies
them in its tracker commit before `READY`, under the IDs the orchestrator gave at assignment (`CLAUDE.md` §3).

**Where an entry goes:**

- A decision that belongs to one spec goes at the end of that spec's file, `docs/decisions/SPEC-NN.md`. When a
  PR spans specs, it goes in the file of the spec the decision is about.
- Cross-cutting and process decisions (tooling, CI, orchestration, rules for every spec) and every `needs-owner` or
  `pending-owner` entry go in Entries below; open ones are also listed in the index of open items.
- D-IDs are one sequence across all files. Find any entry with `grep -rn "### D-NNNN" docs/DECISIONS.md docs/decisions`.
- Never read this file or the per-spec files in full: read your spec's file, the open items and the entries you
  are pointed to.

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

None.

---

## Per-spec files

One file per spec, `docs/decisions/SPEC-00.md` to `docs/decisions/SPEC-22.md`, each linked to its spec. A spec with
no decisions yet has a file with only its header.

The split from one file (#PR) put each entry in the file of the first spec its `Spec/PR` field names, except
D-0397 (in SPEC-05.md; its field names SPEC-07 PR 6 + SPEC-05 follow-ups) and the cross-cutting entries below.
SPEC-05 follow-ups decided in #80 (D-0395, D-0398, D-0399) are in SPEC-07.md.

---

## Entries

Cross-cutting, process and owner items.

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

### D-0016 — The UI freeze covers flows and on-screen elements

- Date: 2026-10-14 · Spec/PR: — · Status: decided-owner
- Decision: Frozen means the user flows and the set of on-screen elements: no flow changes and no added or removed elements, routes, labels or columns. Minor visual changes are allowed when they reduce maintenance, improve performance or increase consistency (e.g. shadcn/ui defaults where the difference is cosmetic, unified spacing and states). CSV/Excel layouts stay frozen cell for cell.
- Alternatives: Pixel-level match to legacy with only bug, accessibility, usability and consistency fixes (rev 1.1 wording).
- Why: A pixel match would make every shadcn/ui default a deviation (D-0015) with no benefit to users. ARCHITECTURE §1, §2 C7, §12.2 and A-2 (rev 1.2), CLAUDE.md C7, INV-66, INV-67, `docs/specs/README.md`, SPEC-14 and SPEC-15/16/17 (§1 and screenshot criteria) updated.
- Reversible: yes — reword C7 back.
- Owner answer: Owner decision, 2026-10-14.

### D-0018 — No Python in the repo tooling

- Date: 2026-10-14 · Spec/PR: tooling PR (#10) · Status: decided
- Decision: The merge guard is TypeScript (`tools/orchestrator/src/merge-guard.ts`, run by `node` with no build step, behaviour identical to `merge_guard.py`); the hook in `.claude/settings.json` denies when `node` or the script fails. The orchestrator tests are Vitest under `tools/orchestrator/test/`, including `bash -n` over `tools/orchestrator/*.sh`, so the `tools` CI job and `pnpm check:tools` fold into `check`. The shell scripts parse JSON with `node`. `ruff.toml`, `tools/tests/` and the uv/ruff/pytest steps are deleted; ARCHITECTURE rev 1.4 drops the C15 ruff C90 mention.
- Alternatives: Keep Python for the repo tools only (a second toolchain, uv on every machine and CI runner).
- Why: One language and one toolchain (Vite+) for the whole TypeScript project.
- Reversible: yes — tooling only.
- Owner answer: Owner decision, 2026-10-14.

### D-0019 — Node 26

- Date: 2026-10-14 · Spec/PR: tooling PR (#10) · Status: decided
- Decision: Node 26 everywhere: CI `setup-node` 26, `engines` `node >=26`, `@types/node` `^26`, and the Node 26 SEA sidecar (ARCHITECTURE rev 1.4: §3, §13, §16, A-4; SPEC-00, SPEC-01, SPEC-20).
- Alternatives: Stay on Node 24 LTS.
- Why: Node 26 becomes LTS in late October 2026, before the desktop release; it is installed on the build machine.
- Reversible: costly — the SEA sidecar and CI move together.
- Owner answer: Owner decision, 2026-10-14.

### D-0203 — Retarget stacked PRs to the merged PR's base

- Date: 2026-10-15 · Spec/PR: orchestrator tools (#48) · Status: decided
- Decision: Before merging, `merge_pr.sh` retargets each open PR based on the PR's branch to that PR's own base, not a hard-coded `main`.
- Alternatives: Always retarget to `main`.
- Why: GitHub deletes a merged PR's branch and closes the PRs based on it (#43 on #42). The PR's base is `main` in the usual case, keeps a longer stack intact, and needs no config value.
- Reversible: yes.

### D-0204 — Retarget before the merge, refuse on failure

- Date: 2026-10-15 · Spec/PR: orchestrator tools (#48) · Status: decided
- Decision: The retarget runs before `gh pr merge`; a failed list or retarget refuses the merge.
- Alternatives: Retarget after the merge, or warn and merge anyway.
- Why: After the merge the stacked PRs are already closed. If the merge then fails, the retargeted PRs only point at the base they would need anyway.
- Reversible: yes.

### D-0230 — The concurrent-batch rule is a skill rule, not a tools/checks scan

- Date: 2026-10-15 · Spec/PR: process (#52) · Status: decided
- Decision: The concurrent batch race (#37, #40, #50) is prevented by a skill rule (`/review-pr` §2.2, `/implement-pr` §4) and the regression test it requires, not by a `tools/checks` scan.
- Alternatives: A text scan that pairs status-guarded UPDATEs with audit inserts.
- Why: The guard (repositories) and the audit insert (shared service helper) are in different modules and joined at runtime; status filters also appear in reads and bulk updates; and a scan cannot see whether a guard fails the batch. It would be noisy and incomplete.
- Reversible: yes.

### D-0231 — The concurrent-batch rule sits in review-pr §2.2 Correctness

- Date: 2026-10-15 · Spec/PR: process (#52) · Status: decided
- Decision: The rule is part of `/review-pr` §2.2 (Correctness), not only reached through §2.6 (Recurring findings).
- Alternatives: Rely on the RECURRING.md row alone.
- Why: Reviewers then apply it to every write use case.
- Reversible: yes.

### D-0257 — Test helpers feed child stdin from a file, never a pipe

- Date: 2026-10-15 · Spec/PR: process fix (#57) · Status: decided
- Decision: `run()` in `tools/orchestrator/test/shell.ts` gives the child a temp file as stdin (empty when there is no input) instead of spawnSync's `input` pipe.
- Alternatives: Drain stdin in the hook command (changes production for a test); catch EPIPE in `run()` (hides failures, in effect a retry); special-case the one test (other callers keep the race).
- Why: A child that exits without reading stdin races the pipe write, and on Linux the lost race is an EPIPE (23 and 34 of 400 loaded runs failed before, 0 of 1,200 after); a file has no write to race.
- Reversible: yes.

### D-0343 — SPEC-00 §4.7 drops the `tools` required check

- Date: 2026-10-15 · Spec/PR: CodeAnt triage · Status: decided
- Decision: The ruleset's required checks are `check`, `licenses`, `real-data-scan`, then `build`, `audit`, `e2e`, `desktop` as each exists. `tools` is removed from SPEC-00 §4.7; the PR 1 row keeps its historical job list.
- Alternatives: Leave the spec as written (H1 applied from it would wait forever on a job nobody runs).
- Why: D-0018 folded the `tools` CI job into `check`; `ci.yml` has no `tools` job (CodeAnt on #10).
- Reversible: yes.

### D-0344 — Reviewers judge every CodeAnt inline finding

- Date: 2026-10-15 · Spec/PR: CodeAnt triage · Status: decided
- Decision: `/review-pr` §2.8: the reviewer waits for CodeAnt's review of the head commit, judges each inline finding (Nitpicks and PR Risk summaries skipped) with the same buckets as its own, and replies on each thread. A backfill triage of the 90 inline findings on merged PRs fixed the nine still valid (D-0343 among them) and logged two edge cases (EC-52, EC-53) in one PR.
- Alternatives: A merge-script check for unanswered bot threads (a second gate on a third-party bot's comment format).
- Why: Findings were triaged only when an agent happened to read them; CodeAnt caught defects our review missed (#37, #40, #50).
- Reversible: yes.

### D-0396 — D1's 100-parameter limit: chunk at the call site, refuse at the port

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: Lists of rows or ids are chunked with `insertRows`, `idRuns` and `inBatches` (`packages/db`); `wrapDrizzle` refuses any statement binding more than 100 parameters before it runs, on every executor.
- Alternatives: Chunk automatically inside the port.
- Why: Built SQL can't be split safely in general; refusing at the port makes node:sqlite fail where D1 would, so every test catches a missed chunk.
- Reversible: yes.

### D-0400 — Remove the PreToolUse guards hook

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: The hook in `.claude/settings.json` and the guard code only it ran (`guards.ts`, `merge-guard.ts`, `path-guard.ts`) and their tests are removed. `merge_pr.sh` stays the only merge path and `new_worktree.sh` the only way to create a worktree; INV-89 is enforced by `merge_pr.sh`, rulesets and review. ARCHITECTURE revision 1.7.
- Alternatives: Keep the hook.
- Why: Owner decision.
- Reversible: yes.

### D-0401 — One PR per batch of related rows

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: One PR covers a batch of related ready rows, normally all ready rows of one spec or of adjacent specs touching the same code, 30-80 files or about 1500-4000 lines, on branch `spec-NN/pr-A-B-<name>`; one `/simplify` pass and one review per PR (CLAUDE.md §3, the skills).
- Alternatives: One row per PR.
- Why: Owner direction.
- Reversible: yes.

### D-0402 — At most two Vitest workers locally

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: `vite.config.ts` sets `maxWorkers: 2` when `CI` is unset; CI keeps Vitest's default. Tests run through `pnpm test`, never `npx`.
- Alternatives: Cap CI too.
- Why: Several agents test at once on one machine (owner priority); CI time stays as it was.
- Reversible: yes.

### D-0414 — Docs-only changes skip the code jobs

- Date: 2026-10-15 · Spec/PR: SPEC-14 PRs 5-8 (#82) · Status: decided
- Decision: A pull request whose changed paths all match `docs/**`, `*.md` or `.claude/skills/**` skips check, licenses, build, audit and e2e through a first `changes` job and job-level `if:`; the `changes` job runs `vp fmt --check` on those files; an empty or failed diff and every push to main run everything. `CI_FIRST_JOB` is `changes`.
- Alternatives: Workflow-level `paths-ignore`.
- Why: Owner direction; failing open keeps a skipped `check` from hiding code changes.
- Reversible: yes.

### D-0420 — Sidecar: SPA embedded in the bundle, one mechanism for SEA and fallback

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 1 (#81) · Status: decided
- Decision: `build-sidecar` bundles a generated entry that calls the node entry's `run(web)` with the SPA from a virtual module (base64 in the bundle, decoded once at start); `startServer` takes `web: WebFiles` (`Pick<Storage, "get">`). The SEA and the `--fallback` layout (node + `sidecar.cjs`) share it. The build lives at `tools/release/src/build-sidecar.ts` (repo convention `tools/<pkg>/src`).
- Alternatives: SEA `assets` read with `node:sea` (no base64, but the fallback would need a folder or a second mechanism); swapping a module by path in esbuild (fragile).
- Why: One code path for both layouts; the SPA is under 1 MB.
- Reversible: yes.

### D-0421 — Shell page lives in a hidden window for the app's life

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 2 (#81) · Status: decided
- Decision: The bundled page runs in a hidden `shell` window; after the port line and health it creates the `main` window at the loopback URL. It owns the sidecar and the tray, so a later sidecar exit is reported too (ADR 0001 open item). Closing `main` destroys `shell`; the app exits and the shell plugin ends the sidecar.
- Alternatives: one window that navigates away (loses the controller, as in the spike).
- Why: Keeps sidecar control in TypeScript (D-0008) and covers exits after load.
- Reversible: yes.

### D-0422 — Startup and stop errors: one plain dialog with the log folder

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 2 (#81) · Status: decided
- Decision: Any sidecar exit outside shutdown shows its last non-indented stderr line in an `ask` dialog ("Open log folder" / "Close"), then quits. The folder opens by running `explorer` through `shell:allow-execute`, scoped to `^[A-Za-z]:\\[^"]*\\SenstoSales\\logs$`. A health timeout (10 s after the port line) shows a fixed message.
- Alternatives: plugin-shell `open` (deprecated since 2.1); plugin-opener (not in the §13.1 plugin list).
- Why: §4.2 plain words; least privilege.
- Reversible: yes.

### D-0423 — Shell log beside the sidecar's logs

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 2 (#81) · Status: decided
- Decision: tauri-plugin-log writes `%LOCALAPPDATA%\SenstoSales\logs\shell.log` at Info; the shell page copies sidecar stderr lines into it.
- Alternatives: Tauri's app log dir under the bundle identifier.
- Why: SPEC-21 "the shell's log plugin writes alongside"; one folder to open.
- Reversible: yes.

### D-0424 — Loopback app capability and tray contract with platform/tauri.ts

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 3 (agreed with SPEC-14 PR 7) (#81) · Status: decided
- Decision: `http://127.0.0.1:*` in window `main` gets `dialog:allow-open`, `dialog:allow-save`, `notification:default`, `core:tray:allow-get-by-id`, `core:tray:allow-set-tooltip`; no shell, fs or window control. The shell creates tray icon id `main` (Open, Quit); tray status is its tooltip. Save-as stays in the page (`showSaveFilePicker`, else a blob download), not a Rust download handler.
- Alternatives: fs plugin for Save-as; a Rust `on_download` Save dialog (logic in Rust, against D-0008).
- Why: Least privilege; data never over IPC (§13.1).
- Reversible: yes.

### D-0425 — Updater plugin registered with its config in PR 5

- Date: 2026-10-15 · Spec/PR: SPEC-20 PRs 2, 5 (#81) · Status: decided
- Decision: PRs 2–4 register single-instance, log, shell, dialog and notification (tray is core); the updater plugin comes with its pubkey config and the release workflow in PR 5 (H6).
- Alternatives: register it now with a placeholder key.
- Why: The plugin needs its config; a placeholder key would be shipped dead code.
- Reversible: yes.

### D-0426 — Installer hook moves the per-user default to Programs

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 4 (#81) · Status: decided
- Decision: Tauri's per-user NSIS default is `%LOCALAPPDATA%\<productName>`, our data folder. `installer-hooks.nsh` moves that default to `%LOCALAPPDATA%\Programs\SenstoSales` in the GUI init (directory page) and at the start of the install section (silent installs), before any file or registry write. A folder the user picked, or an earlier install's folder, stays.
- Alternatives: a full custom NSIS template; another productName.
- Why: §13.2 and INV-82; Tauri has no install-dir setting.
- Reversible: yes.

### D-0427 — desktop CI job

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 4 (#81) · Status: decided
- Decision: `desktop` runs on windows-2025 with the image's Rust, caches cargo with `actions/cache` keyed on `Cargo.lock`, runs `pnpm build:desktop`, the smoke test on the installer, and uploads the installer for 7 days. Adding it to the ruleset's required checks is part of H1.
- Alternatives: `Swatinem/rust-cache` (LGPL-3.0, avoided under C13); path filters (a required check that never runs stays pending).
- Why: §14.2 `desktop` job.
- Reversible: yes.

### D-0428 — Bundle identifier and shell window

- Date: 2026-10-15 · Spec/PR: SPEC-20 PR 2 (#81) · Status: decided
- Decision: Identifier `app.senstosales.desktop` (it names the WebView2 profile folder, so it stays fixed); app window 1280×800, minimum 1024×640, centred; icon generated from an SVG mark in the `--primary` colour.
- Alternatives: none material.
- Why: Changing the identifier later loses WebView storage.
- Reversible: costly for the identifier.
