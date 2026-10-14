// The data directory (ARCHITECTURE §13.2, INV-82): `%LOCALAPPDATA%\SenstoSales`, never the app folder, so an
// upgrade or uninstall leaves the data alone.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const DATA_FOLDERS = ["db", "logs", "backups", "exports", "html"] as const;

/** `SENSTO_DATA_DIR` (tests and development) or `%LOCALAPPDATA%\SenstoSales`. */
export function resolveDataDir(env: Readonly<Record<string, string | undefined>>): string {
  if (env["SENSTO_DATA_DIR"]) return env["SENSTO_DATA_DIR"];
  if (env["LOCALAPPDATA"]) return join(env["LOCALAPPDATA"], "SenstoSales");
  throw new Error("SenstoSales could not find its data folder (LOCALAPPDATA is not set).");
}

export interface DataPaths {
  /** The database file. */
  readonly db: string;
  readonly backups: string;
}

/** Creates the folders that are missing and returns the paths startup needs. Folders only: no database or file
 * content is written here (C9). */
export async function prepareDataDir(root: string): Promise<DataPaths> {
  await Promise.all(DATA_FOLDERS.map((folder) => mkdir(join(root, folder), { recursive: true })));
  return { db: join(root, "db", "senstosales.db"), backups: join(root, "backups") };
}
