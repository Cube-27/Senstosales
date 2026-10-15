# SPEC-20 decisions

Decisions for [SPEC-20 — Desktop packaging and release](../specs/SPEC-20-desktop-packaging-release.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

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
