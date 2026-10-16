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

### D-0655 — VERSION format and stamp targets

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: `VERSION` is plain `major.minor.patch`. `tools/release/src/stamp-version.ts` writes it by text edit into the root and every workspace `package.json` (adding the field where missing) and into `tauri.conf.json`; `--check` runs in `check:code`. The Rust crate version is not stamped: Tauri uses the config's version for the installer and the updater.
- Alternatives: also stamp Cargo.toml/Cargo.lock (two more formats, a layout-dependent lockfile regex); `"version": "../package.json"` in tauri.conf.json.
- Why: INV-105's targets with the fewest formats; text edits keep each file's formatting.
- Reversible: yes.

### D-0656 — Update flow in the shell

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: once per start, after the app window opens, the shell checks for an update and downloads it in the background, then asks once ("Install now" / "Later"). On yes it kills the sidecar (flagged so the exit is not reported as a crash), runs `install()` (passive NSIS), and quits if that returns. A failed check or download is only logged; a failed install shows the plain error dialog.
- Alternatives: `downloadAndInstall` straight after the prompt (the app could close mid-work, and the running sidecar exe would block the installer); closing the sidecar's stdin (plugin-shell's `Child` cannot).
- Why: one prompt for low-tech users (C11), no surprise closing, sidecar exe released before the installer writes.
- Reversible: yes.

### D-0657 — Updater permissions

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: only the `shell` capability gets `updater:allow-check`, `updater:allow-download`, `updater:allow-install` and `shell:allow-kill`; the loopback app gets none (ADR 0001).
- Alternatives: `updater:default` (adds download-and-install).
- Why: least privilege.
- Reversible: yes.

### D-0658 — Updater endpoint and manifest

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: the endpoint is the newest GitHub release's `latest.json` (`releases/latest/download/latest.json`). `tools/release/src/updater-manifest.ts` writes it with the `windows-x86_64` key, the installer URL under the download base the workflow passes, and the `.sig`; it refuses a signature whose minisign key id differs from the trusted pubkey.
- Alternatives: `tauri-apps/tauri-action` (another third-party action with release write access).
- Why: a small tested script; a wrong signing secret fails the release instead of breaking every installed copy's updates.
- Reversible: yes.

### D-0659 — Release workflow: tag publishes, dry runs use a throwaway key

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: a `v*` tag must equal `v<VERSION>`; only tag runs enter the `release` environment and sign with `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`; a separate publish job holds `contents: write`. Pull requests that touch the workflow, the release scripts, `tauri.conf.json` or `VERSION`, and manual runs, are dry runs signed with a key generated in the job, uploaded as a 7-day artifact, never published. `createUpdaterArtifacts` is passed with `tauri build --config` in this workflow only (the CLI ignores `TAURI_CONFIG`).
- Alternatives: the real key in dry runs (branch code could exfiltrate it); `createUpdaterArtifacts` in tauri.conf.json (every build would need the key).
- Why: least privilege; proof before a tag (#98's dry run signed and wrote the manifest).
- Reversible: yes.

### D-0660 — Cargo cache leaves out the bundle folder

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: the `desktop` and `release` cargo caches exclude `apps/desktop/src-tauri/target/release/bundle`.
- Alternatives: keying the cache on VERSION (a cold Rust build per version bump).
- Why: after a VERSION bump without a Cargo.lock change, a restored old installer would sit beside the new one and fail the one-installer smoke test.
- Reversible: yes.

### D-0661 — SmartScreen text now, screenshots with the operations guide

- Date: 2026-10-16 · Spec/PR: SPEC-20 PR 5 (#98) · Status: decided
- Decision: `docs/OPERATIONS.md` gets the Install section (More info → Run anyway) and an Updates section in words; screenshots come with SPEC-21 PR 5 from the H7 VM.
- Alternatives: none (screenshots need a real Windows screen with a synthetic install).
- Why: agents launch no GUI.
- Reversible: yes.
