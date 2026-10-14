# SPEC-21 — Operations: backups, restore, logs and the operations guide

Layer: L8. Architecture refs: §8.3 (retention), §10.4 (logs, health), §13.2, §13.3, C9; A-4, A-17, A-26.

## 1. Summary

Everything that keeps a local install safe and supportable: the `backup` job (first launch each day and Backup now)
using the SQLite online backup API, rotation keeping 14 daily and 12 monthly backups, Restore from Settings, pino
JSON logs with 14-day rotation and no secrets or document bodies, and `docs/OPERATIONS.md` for users with limited
technical skills. Nothing is pruned except backup files by rotation and log files by rotation; the audit log,
job events, flags and stored HTML are kept (A-26, INV-83).

## 2. Scope

Core:

- `backup` job: online backup to `backups/daily-<date>.db` on the first launch of each day (enqueued after start;
  not a startup write, C9) and on Backup now; pre-upgrade backups (SPEC-07) use their own names and are not
  rotated away by daily rotation.
- Rotation: keep the newest 14 daily and the newest backup of each of the last 12 months (INV-103).
- Restore: Settings lists backups; restoring requires no running job, copies the chosen backup into the live DB via
  the online backup API in the reverse direction, then reloads the app. A safety backup of the current DB is taken
  first.
- Settings UI: Backup now and Restore in the existing settings layout (§13.3), with confirmation in plain words.
- Logs: pino JSON to `logs/`, daily files kept 14 days, redaction of secrets, cookies and document bodies (INV-106);
  the shell's log plugin writes alongside.
- `docs/OPERATIONS.md`: install (including the SmartScreen "More info → Run anyway" step with screenshots from a
  synthetic install), first run and onboarding, folder import, BHEL sync, backups and restore, upgrades and the
  failure dialog, Edge missing (EC-09), where data and logs live, uninstall keeps data.

Out of scope:

- Prune jobs of any kind for business data (A-26); cloud backups (K1).

## 3. Dependencies

- SPEC-05 (`backupTo`), SPEC-07 (data dir, startup), SPEC-08 (jobs), SPEC-15 (settings screen), SPEC-20 (shell
  reload, log plugin).

## 4. Design

| Path                                                       | Responsibility                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/api/src/services/backup.ts`                          | backup job handler, rotation plan (pure function of file names and today) |
| `apps/api/src/platform/node/backup-fs.ts`                  | file operations under `backups/` via the data dir                         |
| `apps/api/src/{routes,services}/restore.ts`                | list and restore                                                          |
| `apps/api/src/platform/node/logger.ts`                     | pino with rotation and redaction                                          |
| `apps/web/src/components/modules/settings/BackupPanel.tsx` | Backup now / Restore                                                      |
| `docs/OPERATIONS.md`                                       | the guide                                                                 |

Error handling: restore refused while a job runs (409, plain message); a failed restore leaves the safety backup and
says where it is.

## 5. Invariants

INV-82, INV-83, INV-103 (new), INV-106 (new).

## 6. Testing strategy

Rotation as a literal table (file lists × today → files to delete); backup job produces a DB that opens and passes
`PRAGMA integrity_check`; restore round-trip (write, backup, change, restore, read original); log capture asserts
no password, cookie or HTML body appears; e2e (web mode) Backup now → list shows it.

## 7. Acceptance criteria

- [ ] Daily backup on first launch; Backup now and Restore work from Settings.
- [ ] Rotation keeps 14 daily and 12 monthly; pre-upgrade backups survive.
- [ ] Logs rotate after 14 days and contain no secrets or document bodies.
- [ ] Every OPERATIONS.md procedure tried once on a VM (H7) (L8 exit with SPEC-20).
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                   | Scope / files                                               | Checks           | Done when                                                                             |
| --- | ----------------------- | ----------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| 1   | Backup job and rotation | `services/backup.ts`, `platform/node/backup-fs.ts`, tests   | `check`          | Rotation table passes; first-launch-of-day and manual backups produce valid DB files. |
| 2   | Restore                 | `routes/restore.ts`, `services/restore.ts`, tests           | `check`          | Round-trip restore passes; refused while a job runs; safety backup taken first.       |
| 3   | Settings backup panel   | `BackupPanel.tsx`, e2e                                      | `check`, `e2e`   | Backup now and Restore work in web mode without layout shift.                         |
| 4   | Logs                    | `platform/node/logger.ts`, tests                            | `check`          | Rotation configured to 14 days; redaction tests pass.                                 |
| 5   | Operations guide        | `docs/OPERATIONS.md` (screenshots from a synthetic install) | `real-data-scan` | Each procedure tried once on a VM (H7); no real data in text or images.               |

## 9. Open issues

- **Restore mechanism** (online backup API into the live DB at runtime, rather than a file swap at startup) keeps
  startup read-only (C9); implementation detail.
- **Monthly retention rule** ("newest backup of each month") is the conservative reading of "12 monthly";
  implementation detail.
