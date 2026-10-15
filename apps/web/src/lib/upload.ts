// BHEL HTML uploads from the browser (SPEC-16 §4.2, D-0131): each file is read as text and sent as JSON (INV-102), and
// every request body stays within the API's 10 MB cap (INV-110). A file that alone would pass the cap is never sent;
// it fails in place with a plain reason, as the API would have refused its whole request.
import { MAX_BODY_BYTES, splitUpload } from "@senstosales/schemas";

import type { UploadOutcome } from "../components/common/index.ts";
import { getPlatform } from "../platform/index.ts";
import { api } from "./api.ts";

const isHtml = (file: File): boolean => /\.html?$/i.test(file.name);

/** The saved BHEL pages the user picks, or null on cancel. */
export const pickHtmlPages = async (): Promise<File[] | null> =>
  (await getPlatform()).pickFiles({ accept: ".html,.htm", multiple: true });

/** The HTML pages in the folder the user picks (none when it holds no pages), or null on cancel. */
export async function pickHtmlFolder(): Promise<File[] | null> {
  const picked = await (await getPlatform()).pickFolder();
  return picked && picked.filter(isHtml);
}

export const TOO_LARGE = "This file is larger than 10 MB, so it cannot be uploaded.";

const NO_RESULT = "The server did not report on this file. Try again.";

type HtmlFile = { name: string; html: string };

const read = async (file: File): Promise<HtmlFile> => ({ name: file.name, html: await file.text() });

/** Uploads one PO or SRV page through its upload route. */
export async function uploadHtml(route: "po.upload" | "srv.upload", file: File): Promise<UploadOutcome> {
  const { requests } = splitUpload([await read(file)]);
  const files = requests[0];
  if (files === undefined) return { status: "failed", reason: TOO_LARGE };
  const { results } = await api.request(route, { body: { files } });
  const [result] = results;
  return result ? { status: result.status, reason: result.reason } : { status: "failed", reason: NO_RESULT };
}

/** Files read and sent per round, so a large folder is never held in memory at once. */
const READ_AHEAD = 50;

/**
 * What a staging body carries beside its files: `,"kind":"srv","stagingId":"<ULID>"` at most. `splitUpload` budgets
 * `{"files":[…]}` only, so the files get the cap less this.
 */
const STAGE_FIELDS_BYTES = JSON.stringify({ kind: "srv", stagingId: "0".repeat(26) }).length - 1;
const STAGE_FILES_BYTES = MAX_BODY_BYTES - STAGE_FIELDS_BYTES;

/** What staging a folder produced: the staging area (none when nothing could be sent) and the files left out. */
export interface Staged {
  readonly stagingId: string | null;
  readonly tooLarge: readonly string[];
}

/**
 * Stages a folder's files for a folder-import job (SPEC-08 §2): in rounds of {@link READ_AHEAD} files, each round
 * split into requests within the cap; the first request opens the staging area and the rest add to it.
 */
const partition = <T>(items: readonly T[], keep: (item: T) => boolean): [T[], T[]] => [
  items.filter(keep),
  items.filter((item) => !keep(item)),
];

export async function stageFolder(kind: "po" | "srv", files: readonly File[]): Promise<Staged> {
  let stagingId: string | null = null;
  const tooLarge: string[] = [];
  for (let start = 0; start < files.length; start += READ_AHEAD) {
    // A file larger than the cap in bytes can never be sent; it is not read.
    const [fits, over] = partition(files.slice(start, start + READ_AHEAD), (file) => file.size <= STAGE_FILES_BYTES);
    const split = splitUpload(await Promise.all(fits.map(read)), STAGE_FILES_BYTES);
    tooLarge.push(...over.map((file) => file.name), ...split.tooLarge.map((file) => file.name));
    for (const batch of split.requests) {
      const staged: { stagingId: string } = await api.request("jobs.stage", {
        body: { kind, files: batch, ...(stagingId === null ? {} : { stagingId }) },
      });
      stagingId = staged.stagingId;
    }
  }
  return { stagingId, tooLarge };
}
