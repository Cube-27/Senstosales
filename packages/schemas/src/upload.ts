// Upload requests within the body cap (D-0131): the API refuses a body over 10 MB before reading it (INV-110), so
// the web client sends an upload's files in requests whose JSON body, escaping included, stays within the cap.
import type { z } from "zod";

import type { zUploadBody } from "./api/common.ts";

/** The API's cap on a request body, in bytes (ARCHITECTURE §9). */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

type UploadFile = z.output<typeof zUploadBody>["files"][number];

/** The bytes `text` takes in UTF-8. `JSON.stringify` output has no lone surrogates, so each pair is 4 bytes. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** `{"files":[]}`: the body around the files, which are joined by commas. */
const ENVELOPE = utf8Length(JSON.stringify({ files: [] }));

/**
 * Groups `files`, in order, into request bodies of at most `maxBytes` once JSON-encoded. A file that alone would pass
 * the cap is returned in `tooLarge`, never sent: the API would refuse its whole request.
 */
export function splitUpload<F extends UploadFile>(
  files: readonly F[],
  maxBytes: number = MAX_BODY_BYTES,
): { requests: F[][]; tooLarge: F[] } {
  const requests: F[][] = [];
  const tooLarge: F[] = [];
  let current: F[] = [];
  let size = ENVELOPE;
  for (const file of files) {
    const bytes = utf8Length(JSON.stringify(file));
    if (ENVELOPE + bytes > maxBytes) {
      tooLarge.push(file);
      continue;
    }
    const added = current.length === 0 ? bytes : bytes + 1;
    if (size + added > maxBytes) {
      requests.push(current);
      current = [file];
      size = ENVELOPE + bytes;
    } else {
      current.push(file);
      size += added;
    }
  }
  if (current.length > 0) requests.push(current);
  return { requests, tooLarge };
}
