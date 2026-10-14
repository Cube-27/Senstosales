# SPEC-20 — Desktop packaging and release

Layer: L8. Architecture refs: §3, §13.1, §13.2, §13.3 (versioning), §14.1 (desktop smoke), §14.2 (`desktop` job), C10,
C12; A-4, A-25; INV-82, INV-93.

## 1. Summary

Ship the app as a per-user Windows install: `apps/api` bundled with esbuild into a Node 26 single-executable
sidecar that serves the embedded SPA on a random loopback port; a Tauri 2 shell (WebView2) that starts the sidecar,
waits for `/api/health` and loads `http://127.0.0.1:<port>/` (data never over Tauri IPC); a per-user NSIS installer
with no admin rights; an updater whose manifest is signed with the Tauri updater key; one `VERSION` stamped
everywhere. v1 artefacts are unsigned, with the one-time SmartScreen step documented (A-25).

## 2. Scope

Core:

- Sidecar build: esbuild bundle of `apps/api/src/platform/node/main.ts` with the built SPA embedded; Node SEA
  config; the `node.exe` + bundle fallback (§13.1) behind a build flag; port handoff per the SPEC-01 ADR.
- Tauri shell (`apps/desktop`): start the sidecar, wait for health, show the startup error dialog in plain words
  (upgrade failure, newer data, port failure), load the loopback URL; plugins single-instance, dialog, notification,
  tray, updater, log, shell; closing the window stops the sidecar. Sidecar control lives in TypeScript
  (`apps/desktop/src`); the Rust entry is the minimal Tauri scaffold (SPEC-00 Open issues).
- Capabilities that let the loopback origin use the dialog, notification and tray plugins (for `platform/tauri.ts`).
- NSIS per-user installer into `%LOCALAPPDATA%\Programs\SenstoSales`; uninstall leaves data; data dir per SPEC-07
  (INV-82). WebView2 and Edge are expected present on Windows 10/11 x64.
- `desktop` CI job (Windows): build the installer and run the desktop smoke test (installed app starts,
  `/api/health` answers, closing the window stops the sidecar).
- Versioning: `VERSION` → `tauri.conf.json`, every `package.json`, the SEA and `/api/health` (INV-105).
- Release workflow on tags: build, sign the updater manifest (secret, H6), publish the unsigned installer and
  manifest (INV-93).

Out of scope:

- Code signing (K6, A-25); Cloudflare deployment (K1); backups and restore (SPEC-21); `docs/OPERATIONS.md`
  content beyond the SmartScreen section (SPEC-21).

## 3. Dependencies

- SPEC-07 (node entry, startup, health), SPEC-14 (built SPA, platform adapter).
- SPEC-01 PR 1 (sidecar ADR).
- Human tasks: H6 (Tauri updater key as a release secret), H7 (fresh Windows VM test).

## 4. Design

### 4.1 Modules

| Path                                                                                  | Responsibility                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `tools/release/build-sidecar.ts`                                                      | esbuild bundle, SPA embedding, SEA blob and injection, fallback layout |
| `tools/release/stamp-version.ts`                                                      | `VERSION` → all targets; `--check` mode in CI                          |
| `apps/desktop/src/{main,sidecar,health}.ts`                                           | sidecar spawn, port read, health wait, error dialog, navigation        |
| `apps/desktop/src-tauri/{tauri.conf.json,capabilities/*.json,Cargo.toml,src/main.rs}` | shell config (minimal Rust scaffold)                                   |
| `apps/desktop/test/smoke.ts`                                                          | installed-app smoke test                                               |
| `.github/workflows/{ci.yml (desktop job),release.yml}`                                | builds and release                                                     |

### 4.2 Error handling

Sidecar exits before health → the shell shows the sidecar's last plain-language message and offers to open the log
folder; a second launch focuses the running window (single-instance).

## 5. Invariants

INV-82, INV-93, INV-105 (new).

## 6. Testing strategy

`desktop` job smoke test on Windows; `stamp-version --check` in `check`; a test that the sidecar binds only
`127.0.0.1` (C10) when started from the SEA; manual fresh-VM install and upgrade (H7).

## 7. Acceptance criteria

- [ ] Clean install on a fresh Windows VM, no admin rights; data under `%LOCALAPPDATA%\SenstoSales` (L8 exit, with
      SPEC-21).
- [ ] Closing the window stops the sidecar; a second launch focuses the window.
- [ ] One `VERSION` appears in the installer, `/api/health` and every package.
- [ ] Release artefacts are unsigned; the updater manifest is signed.
- [ ] `pnpm verify` and every CI job green, including `desktop`.

## 8. PR plan

| #   | Title                                    | Scope / files                                                                                                | Checks                   | Done when                                                                                                                               |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sidecar build                            | `tools/release/build-sidecar.ts`, tests                                                                      | `build`                  | The SEA (and fallback) starts, prints its port and serves the SPA and `/api/health` on 127.0.0.1.                                       |
| 2   | Tauri shell and sidecar lifecycle        | `apps/desktop/src/*`, `src-tauri/*`                                                                          | `build`                  | Shell starts the sidecar, waits for health, loads the UI; close stops the sidecar; single-instance focus; startup errors shown plainly. |
| 3   | Plugin capabilities and tray             | `src-tauri/capabilities/*`, tray menu in `apps/desktop/src/main.ts`                                          | `build`, `e2e`           | `platform/tauri.ts` pickers, Save-as, notifications and tray status work in the shell; web mode unaffected.                             |
| 4   | NSIS installer and `desktop` job         | `tauri.conf.json` bundler config, `apps/desktop/test/smoke.ts`, `ci.yml` `desktop` job                       | `desktop`                | The job builds the installer and the smoke test passes; the job joins the required checks.                                              |
| 5   | Versioning, updater and release workflow | `tools/release/stamp-version.ts`, `release.yml`, updater config, SmartScreen section of `docs/OPERATIONS.md` | `check`, `release` (tag) | A tag produces an unsigned installer and a signed manifest; versions match everywhere.                                                  |

## 9. Open issues

- Rust scaffold vs INV-90: see SPEC-00 Open issues.
- SEA fragility: the fallback is selected by the ADR from SPEC-01; switching later is a build flag, not an
  architecture change.
