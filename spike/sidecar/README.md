# Spike: sidecar lifecycle (SPEC-01 PR 1)

Throwaway prototype for `docs/adr/0001-sidecar-packaging.md`. Not built by the workspace; never merged.

Layout: `server/main.ts` (Hono + node:sqlite sidecar), `build-sidecar.mjs` (esbuild bundle -> Node SEA),
`shell/` (minimal Tauri 2 shell: `src-tauri/` Rust scaffold, `ui/main.ts` starts the sidecar), `measure/` (timing and
lifecycle scripts).

Reproduce on Windows 11 x64 (Rust stable + MSVC, Node 24 or 26, pnpm):

```sh
pnpm install                                  # this folder is its own pnpm workspace
node build-sidecar.mjs <path-to-node.exe>     # Node 24 also needs SIGNTOOL=<Windows SDK signtool.exe>
node measure/sidecar.mjs dist/sensto-sidecar.exe -- 20 <empty-dir>          # SEA timings
node measure/sidecar.mjs <node.exe> dist/sidecar.cjs -- 20 <empty-dir>      # node.exe + bundle fallback
pnpm build:ui && cd shell && ../node_modules/.bin/tauri build               # shell + NSIS installer
node measure/shell.mjs <dir with sensto-spike.exe> <empty-dir> 5             # start, close, single instance, hard kill
powershell -File measure/focus.ps1 -AppDir <dir> -DataDir <empty-dir>         # focus on second launch (via Explorer)
```

Path test: install with `SenstoSpike_0.0.1_x64-setup.exe /S /D=<dir with spaces and non-ASCII>` and point the
scripts at that directory and at a non-ASCII data directory.

Windows paths over 260 characters break the Rust link step (LNK1104); with a deep checkout, set a short
`CARGO_TARGET_DIR`.
