# SPEC-21 decisions

Decisions for [SPEC-21 — Operations: backups, restore, logs and the operations guide](../specs/SPEC-21-operations-backup-logs.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0385 — Monthly backup retention counts months that have a backup

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: Rotation keeps the newest 14 daily copies and the newest copy of each of the 12 most recent months that have any copy; it reads file names only.
- Alternatives: The last 12 calendar months from today.
- Why: SPEC-21 §9 calls this the conservative reading; after a long gap older monthly copies survive.
- Reversible: yes, one function (`planRotation`).

### D-0386 — Backup now writes today's daily copy

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: Backup now replaces `daily-<today>.db`, via a `.partial` file and a rename, so a copy is only replaced by a complete one.
- Alternatives: A separate `manual-<stamp>.db` with its own rotation.
- Why: SPEC-21 §2 names `daily-<date>.db` for both triggers.
- Reversible: yes.

### D-0387 — Restore copies into the live database, then upgrades

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: Restore checks the backup (integrity; refuses a newer schema), copies it into the live DB with the online backup API in one step, then runs `upgradeGate` when it is older (that makes its own pre-upgrade copy).
- Alternatives: Swap the file at the next startup.
- Why: SPEC-21 §9 keeps startup read-only (C9); a restored pre-upgrade copy must still match this build.
- Reversible: yes.

### D-0388 — A restore ends the job rows its copy shows as active

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: After the copy, every queued or running job row is ended as `cancelled`, as an EC-28 cancel (`cancelOrphan`, shared with `jobs.cancel`).
- Alternatives: Leave them, so every later start answers 409 until the user cancels.
- Why: A backup made by the job always holds its own row as `running`.
- Reversible: yes.

### D-0389 — Restore is a request, not a job

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: Restore runs in its request after a job check, not on the single-flight runner. A job started during the copy writes to the restored data (review Consider item, accepted for v1).
- Alternatives: A `restore` job type, or an exclusive section in the runner.
- Why: ARCHITECTURE §7.3 fixes the job types; the user waits for the answer.
- Reversible: yes.

### D-0390 — Restore failures carry a plain message (500)

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: `OperationFailedError` (500) reports a restore that failed part way and names the safety copy; an unusable backup is 400 `backup-unusable`, a running job 409, an unknown name 404.
- Alternatives: A generic 500.
- Why: SPEC-21 §4: a failed restore says where the safety copy is.
- Reversible: yes.

### D-0391 — API logs: one file per IST day, own destination, redaction by key

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: `logs/api-<date>.log`, synchronous writes, newest 14 days kept; a small daily destination instead of `pino-roll`; `password`, `cookie`, `authorization`, `captcha`, `captchaPng`, `otp`, `html`, `body` redacted at the top level and one level down.
- Alternatives: `pino-roll` (worker-thread transport).
- Why: No worker threads for the SEA sidecar (SPEC-20); nothing lost on exit.
- Reversible: yes.

### D-0392 — Keep the event loop awake during node:sqlite backups

- Date: 2026-10-15 · Spec/PR: SPEC-21 PRs 1, 2, 4 (#79) · Status: decided
- Decision: `backupTo` and `restoreFrom` keep a 10 ms timer alive while the copy runs.
- Alternatives: None at our level.
- Why: With Node 26 on Windows a backup's completion did not wake an idle loop: 8-30 s per copy in the test worker without it, about 10 ms with it.
- Reversible: yes, remove when Node fixes it.

### D-0500 — Backups panel placement and list

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: The Backups panel sits in Settings → System Defaults below Access Control; its list is a `DataTable` (Backup, Type, Action) paged in memory, with types Daily, Before upgrade, Before restore.
- Alternatives: A new settings section.
- Why: SPEC-21 §2 says "in the existing settings layout"; a new section would add a frozen element (C7).
- Reversible: yes.

### D-0501 — Restore reloads the page

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: After `backups.restore` succeeds the page reloads (`lib/reload.ts`), in a browser and in the shell.
- Alternatives: A shell IPC reload (SPEC-20).
- Why: The shell loads the same loopback page (ARCHITECTURE §13.1), so a page reload is the app reload; the restored data's sessions then apply (EC-61).
- Reversible: yes.

### D-0502 — Backup now follows its job like any job

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: The mutation only starts the `backup` job; the status line is derived from `jobQuery`, and the list's query key holds the finished job id so the new copy is read without an effect. A job read that fails says why and frees the buttons.
- Alternatives: A polling loop inside the mutation.
- Why: The shared 2 s poll rule (§7.3) and the owner's no-effects rule.
- Reversible: yes.

### D-0603 — Manual backups have their own name

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: Backup now writes `manual-<stamp>.db`; manual copies are never rotated and list as Manual. The job body takes an optional `manual` flag.
- Alternatives: Overwrite the day's daily copy.
- Why: Backup now replaced the daily copy (UI-SET-10); rev 1.9.
- Reversible: yes.

### D-0632 — The supplier id is read per call

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: `supplierRef.find` queries the supplier id every time instead of keeping it.
- Alternatives: Keep the cache and forget it on restore.
- Why: A restore can bring back a backup made before onboarding; the onboarding gate must see that at once, or every route answers onboarding-required while the status says done (N-RESTORE). One indexed read of a one-row table.
- Reversible: yes.
