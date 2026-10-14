# ADR 0001 — Sidecar packaging and port handoff

- Status: accepted · Date: 2026-10-14 · Spec: SPEC-01 §4.1, PR 1 · Architecture: §3, §13.1, §13.2, C10, C12; D-0008
- Prototype: tag `spike-sidecar`, commit
  [`3042dcf`](https://github.com/Cube-27/Senstosales/tree/3042dcf023f94c0513d0faaec42544fd9832640b/spike/sidecar)
  (not merged; SPEC-20 builds the sidecar and the shell properly).

## Context

ARCHITECTURE §13.1 ships a Tauri 2 shell that starts the API as a Node single-executable (SEA) sidecar on a random
loopback port, waits for `/api/health` and loads `http://127.0.0.1:<port>/`. The fallback it names is `node.exe` plus
the bundle. The spike checks the mechanism before SPEC-20 starts.

Questions (SPEC-01 §4.1):

1. Does a SEA of a Hono app with `node:sqlite` start reliably?
2. How does the shell learn the random port: a stdout line or a file?
3. Does a second launch focus the running window (single instance)?
4. Does closing the window end the sidecar (verified by PID)?
5. Does it work from an install path with spaces and non-ASCII characters?
6. How large is the SEA, and how long does it take to start?

## Method

- Runtimes: Node 24.21.0 (blob from `--experimental-sea-config`, injected with `postject` 1.0.0-alpha.6) and Node
  26.8.1 (one step, `--build-sea`). Both bundle SQLite 3.53.4. The owner is moving the project to Node 26 (relayed
  by the orchestrator, 2026-10-14); ARCHITECTURE still names Node 24, and that edit lands in a later tooling PR.
- Sidecar: `hono` 4.13.13 and `@hono/node-server` 2.1.5, bundled by `esbuild` 0.28.2 into one minified CJS file
  (42 KB). It opens a WAL database in `SENSTO_DATA_DIR`, listens on `127.0.0.1:0`, then writes the port to a file
  and prints `SENSTO_PORT=<port>`. It exits when its stdin reaches EOF.
- Shell: `tauri` 2.12.3, `tauri-plugin-shell` 2.5.0, `tauri-plugin-single-instance` 2.5.3, `@tauri-apps/cli`
  2.12.2, per-user NSIS installer. The Rust entry only registers the two plugins; the single-instance callback
  unminimises, shows and focuses the main window. The shell page (`ui/main.ts`) spawns the sidecar with
  `Command.sidecar`, reads the port line, polls `/api/health` and then calls `location.replace` with the loopback
  URL. The health route allows the shell origin `http://tauri.localhost` to read it cross-origin. The `shell:allow-spawn`
  permission is scoped to the sidecar and granted only to the bundled page; the loopback origin gets no capability.
- Scripts: `measure/sidecar.mjs` (sidecar alone: spawn to port line, to health 200, stdin close to exit),
  `measure/shell.mjs` (built shell: start to first page served, window close, second launch, hard kill) and
  `measure/focus.ps1` (minimise the window, relaunch through Explorer, check restore and foreground).
- Machine: Intel i5-1334U, 16 GB RAM, Windows 11 (build 26200).

## Results

| Question                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Starts reliably        | Pass. 100/100 SEA starts (60 on Node 24, 40 on Node 26) and 40/40 fallback starts reached health 200; the 80 runs whose exit codes were recorded all exited with code 0. Each of the 19 shell launches timed by `measure/shell.mjs` served the first page. No experimental warning on either runtime. `netstat` shows the sidecar listening only on `127.0.0.1` (C10).                                                                                                                                        |
| 2. Port handoff           | Both work. The port line and the port file agreed in all 80 runs where both were compared. The line arrives a median 187–293 ms after spawn, and health answers 27–38 ms later. Chosen: the stdout line (Decision).                                                                                                                                                                                                                                                                                           |
| 3. Single instance        | Pass. A second launch exits with code 0 in 72–100 ms. One shell and one sidecar remain. With the window minimised and the second launch started through Explorer (as a double-click does), the window is restored and in the foreground (2/2). Launched from a background process, the window is restored but not brought to the front: Windows denies a background process the foreground.                                                                                                                   |
| 4. Close ends the sidecar | Pass. Closing the window (WM_CLOSE, as the X button does) ended the sidecar's PID within 151–455 ms in 13/13 runs. `tauri-plugin-shell` kills its children on `RunEvent::Exit` (`src/lib.rs`, lines 163–173 in 2.5.0). A hard kill of the shell (`taskkill /F`) skips that cleanup; the sidecar then exited on stdin EOF within 207–260 ms (2/2).                                                                                                                                                             |
| 5. Spaces and non-ASCII   | Pass. A silent NSIS install (`/S /D=`) into a folder whose name has spaces, Latin accents, CJK and Devanagari took 9.3 s. Every check above passed from it, with a data folder of the same kind (5 starts, close, single instance, hard kill, focus). `node:sqlite` created its database there. The uninstaller removed the program files.                                                                                                                                                                    |
| 6. Size and start time    | SEA: 93.8 MB on Node 24, 104.0 MB on Node 26; the shell is 10.1 MB; the NSIS installer with the Node 26 sidecar is 27.2 MiB. Spawn to health 200, median per round of n=20: SEA on Node 24 331, 236 and 237 ms; SEA on Node 26 214 and 266 ms; fallback 250 ms (Node 24) and 177 ms (Node 26). Maxima reach 351–794 ms. Shell start to first page served: 826–1676 ms (n=5), 966–1083 ms after a rebuild (n=3); 1112–3397 ms from the fresh install, with the 3.4 s on the first launch (cause not isolated). |

The Node 24 and Node 26 differences in start time are within the spread between rounds on the same runtime.

Signatures: injecting into Node 24's `node.exe` makes postject warn "The signature seems corrupted" unless the
signature is first removed (`signtool remove /s`, Windows SDK). Node 26's `--build-sea` needs neither postject nor
signtool. Both outputs report `NotSigned`, which matches the unsigned v1 release (A-25).

## Decision

- Ship the SEA. The `node.exe` + bundle fallback stays behind the SPEC-20 build flag, but nothing measured calls
  for it. It starts 40–90 ms faster at the median, which is small next to the 1–1.7 s shell start, and it
  ships the same `node.exe` plus a loose file.
- Port handoff: the sidecar prints one line, `SENSTO_PORT=<port>`, after `listen` succeeds, and writes no port file.
  The shell already holds the pipe; a file can be stale after a crash and adds a data-dir path to agree on.
- Lifecycle: the shell page spawns the sidecar with `Command.sidecar` (D-0008: control in TypeScript). Closing the
  window ends it through the shell plugin's exit cleanup. The sidecar also exits on stdin EOF, which covers a shell
  that is killed or crashes.
- Readiness: the shell polls `GET /api/health`, then navigates. Health is a public route (§10.1), and it sends
  `Access-Control-Allow-Origin` for the shell origin only, so the shell page can read it.
- Single instance: `tauri-plugin-single-instance` is registered first, and its callback focuses the main window.
  This is plugin configuration in the Rust entry, not logic (D-0008).
- Build: `build-sidecar` uses `--build-sea` on Node 26. The Node 24 path (blob, `signtool remove /s`, postject) is
  only needed while the project is on Node 24.

Open items for SPEC-20:

- After navigation the shell page is replaced by the app, so it cannot report a sidecar that exits later. SPEC-20
  §4.2 specifies only the exit before health; a later exit shows the WebView's connection error.
- The loopback origin has no Tauri capability. SPEC-20 PR 3 must grant dialog, notification and tray access to
  `http://127.0.0.1:<port>` (Tauri's remote-URL capabilities). That was not tested here.
- A desktop smoke test that checks focus must launch the second instance through Explorer, or check that the window
  is restored instead of checking the foreground.

## Reproduce

```sh
git switch --detach 3042dcf023f94c0513d0faaec42544fd9832640b
cd spike/sidecar && pnpm install
node build-sidecar.mjs <path-to-node.exe>
node measure/sidecar.mjs dist/sensto-sidecar.exe -- 20 <empty-dir>
pnpm build:ui && (cd shell && ../node_modules/.bin/tauri build)
node measure/shell.mjs <folder with sensto-spike.exe> <empty-dir> 5
```

`spike/sidecar/README.md` on the tag lists the fallback, focus and path runs.
