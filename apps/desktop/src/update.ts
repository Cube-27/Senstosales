// The update offer (SPEC-20 §13.1 updater, INV-93). The updater plugin checks the signed latest.json of the newest
// GitHub release; a newer version is downloaded while the user works, so the only prompt is "install now?". The
// running sidecar holds its own exe open, so the shell stops it before the installer replaces the files.

/** What the shell needs from `@tauri-apps/plugin-updater`'s `Update`. */
export interface Update {
  readonly version: string;
  download(): Promise<void>;
  install(): Promise<void>;
}

export interface UpdateDeps {
  check(): Promise<Update | null>;
  ask(message: string): Promise<boolean>;
  stopSidecar(): Promise<void>;
  log(line: string): Promise<void>;
}

const question = (version: string) =>
  `SenstoSales ${version} is ready to install. Install it now?\n\n` +
  "SenstoSales will close while it installs. Your data stays where it is.";

/** Offers a newer release once per start. A failed check or download (offline, no release yet) is only logged; an
 * install failure, after the sidecar has stopped, is thrown for the caller to report. */
export async function offerUpdate({ check, ask, stopSidecar, log }: UpdateDeps): Promise<void> {
  let update: Update | null;
  try {
    update = await check();
    if (update === null) return;
    await update.download();
  } catch (err) {
    await log(`update check failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!(await ask(question(update.version)))) return;
  await stopSidecar();
  await update.install();
}
