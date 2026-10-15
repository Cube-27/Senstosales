// `pnpm import:corpus` (SPEC-09 §2, ARCHITECTURE §7.4, A-6): imports the owner's PO and SRV pages through the real
// services and folder-import jobs into a throwaway data folder. `SENSTO_CORPUS_DIR` holds a `po/` and an `srv/`
// folder of BHEL pages; it is read only here, at run time, and never in tests or CI (INV-76). The data folder is made
// in the OS temp folder, never in the repo. The console says pass or fail and where the data is, nothing from the
// pages (C1).
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openRuntime } from "@senstosales/api/node";
import { GST_DEFAULTS } from "@senstosales/db";
import { splitUpload } from "@senstosales/schemas";

/** A synthetic profile: the import needs a supplier (INV-78), and nothing real is typed in. */
const PROFILE = {
  name: "Corpus Import",
  gstin: null,
  address: null,
  state: null,
  stateCode: null,
  contact: null,
  email: null,
  bhelSupplierCode: null,
  bankDetails: {},
  invoiceDefaults: {},
  ...GST_DEFAULTS,
};

type Kind = "po" | "srv";

export interface KindImport {
  /** The finished job, summary included. */
  readonly job: { readonly status: string; readonly error: string | null; readonly summary: unknown };
  /** Files over the API's request cap, which the web client would not send either. */
  readonly tooLarge: readonly string[];
}

export interface CorpusImport {
  readonly po: KindImport;
  readonly srv: KindImport;
  /** Errors the services logged, such as a job summary that could not be built. */
  readonly logged: readonly string[];
  /** Both jobs ended `done` and nothing was logged as an error. */
  readonly passed: boolean;
}

/** The page files under `<corpusDir>/<kind>/`, in path order, as paths inside that folder. */
async function listPages(corpusDir: string, kind: Kind): Promise<string[]> {
  const names = (await readdir(join(corpusDir, kind), { recursive: true }))
    .filter((name) => /\.html?$/i.test(name))
    .map((name) => name.replaceAll("\\", "/"))
    .sort();
  if (names.length === 0) throw new Error(`The corpus has no .html pages in its ${kind}/ folder.`);
  return names;
}

/**
 * Imports `<corpusDir>/po` then `<corpusDir>/srv` into the data folder `dataDir`, migrating and onboarding a new one.
 * Importing again into the same folder reuses its database.
 */
export async function importCorpus({
  corpusDir,
  dataDir,
}: {
  corpusDir: string;
  dataDir: string;
}): Promise<CorpusImport> {
  // Both folders are listed first, so a corpus missing either fails before anything is made.
  const names = { po: await listPages(corpusDir, "po"), srv: await listPages(corpusDir, "srv") };
  const logged: string[] = [];
  const log = (_fields: unknown, message: string) => void logged.push(message);
  const { db, services, jobs } = await openRuntime({
    dataDir,
    logger: { debug: () => {}, info: () => {}, warn: log, error: log },
  });

  /** Stages the pages of `kind` as the web client does and runs its folder-import job to the end. The pages are read
   * one kind at a time, so only one folder is held in memory. */
  async function importKind(kind: Kind): Promise<KindImport> {
    const pages: { name: string; html: string }[] = [];
    for (const name of names[kind]) pages.push({ name, html: await readFile(join(corpusDir, kind, name), "utf8") });
    const { requests, tooLarge } = splitUpload(pages);
    let stagingId: string | undefined;
    for (const files of requests) {
      ({ stagingId } = await services.folderImport.stage({ kind, files, ...(stagingId && { stagingId }) }));
    }
    if (stagingId === undefined) throw new Error(`Every page in the corpus's ${kind}/ folder is too large to send.`);
    const { id } = await services.jobs.start({ type: `${kind}.import-folder`, stagingId });
    await jobs.idle();
    const { status, error, summary } = (await services.jobs.detail(id)).job;
    return { job: { status, error, summary }, tooLarge: tooLarge.map((file) => file.name) };
  }

  try {
    if (!(await services.onboarding.done())) await services.onboarding.complete(PROFILE);
    // POs first, so the SRVs find them (ARCHITECTURE §7.4).
    const po = await importKind("po");
    const srv = await importKind("srv");
    return { po, srv, logged, passed: po.job.status === "done" && srv.job.status === "done" && logged.length === 0 };
  } finally {
    db.close();
  }
}

async function main(env: Readonly<Record<string, string | undefined>>): Promise<number> {
  const corpusDir = env["SENSTO_CORPUS_DIR"];
  if (!corpusDir) {
    process.stderr.write("Set SENSTO_CORPUS_DIR to the folder holding the po/ and srv/ page folders.\n");
    return 1;
  }
  const dataDir = await mkdtemp(join(tmpdir(), "senstosales-corpus-"));
  const result = await importCorpus({ corpusDir, dataDir });
  process.stdout.write(`Corpus import ${result.passed ? "passed" : "failed"}. Data folder: ${dataDir}\n`);
  return result.passed ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.env);
  } catch (err) {
    process.stderr.write(`Corpus import failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
