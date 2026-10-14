// The Storage port on the local file system (ARCHITECTURE §4.1). Keys are system-made (`html/po/<po>.html`,
// `exports/<ulid>.<ext>`), so a key is `/`-separated plain segments; anything that could leave the root (`..`,
// absolute, drive-qualified, backslashes) is refused before the file system sees it (INV-96, C17).
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import type { Storage } from "../../ports/storage.ts";

const SEGMENT = /^[\w.-]+$/;

/** A file or folder name that cannot leave its parent: no separators, drive letters, `.` or `..`. */
const isPlainName = (s: string): boolean => SEGMENT.test(s) && s !== "." && s !== "..";

function refuse(key: string): never {
  throw new Error(`Storage key not allowed: ${JSON.stringify(key)}`);
}

/** The segments of a key; every one must be a plain name. */
function segmentsOf(key: string): string[] {
  const segments = key.split("/");
  if (!segments.every(isPlainName)) refuse(key);
  return segments;
}

const isMissing = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === "ENOENT";

export function createFsStorage(root: string): Storage {
  const pathOf = (key: string): string => join(root, ...segmentsOf(key));

  return {
    async put(key, bytes) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },

    async get(key) {
      const path = pathOf(key);
      try {
        const buf = await readFile(path);
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    async delete(key) {
      await rm(pathOf(key), { force: true });
    },

    // A prefix is a folder part (`html/po/`) and an optional start of a name (`html/po/10`).
    async list(prefix) {
      const cut = prefix.lastIndexOf("/");
      const folder = prefix.slice(0, cut + 1);
      const start = prefix.slice(cut + 1);
      if (start !== "" && !isPlainName(start)) refuse(prefix);
      const dir = folder === "" ? root : join(root, ...segmentsOf(folder.slice(0, -1)));
      let entries;
      try {
        entries = await readdir(dir, { recursive: true, withFileTypes: true });
      } catch (err) {
        if (isMissing(err)) return [];
        throw err;
      }
      return entries
        .filter((e) => e.isFile())
        .map((e) => folder + relative(dir, join(e.parentPath, e.name)).replaceAll(sep, "/"))
        .filter((key) => key.startsWith(prefix))
        .toSorted();
    },
  };
}
