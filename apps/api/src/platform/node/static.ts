// Serves the built SPA from the API's own origin (ARCHITECTURE §9: one process, one port). A path that names a file
// gets that file; any other app path gets `index.html`, so the SPA's router handles it. A placeholder page stands in
// until `apps/web` is built. Files are read through the Storage adapter, so the same key rule keeps every read inside
// the SPA folder (INV-96).
import type { Context, MiddlewareHandler } from "hono";
import { getMimeType } from "hono/utils/mime";

import { createFsStorage } from "./storage-fs.ts";

const PLACEHOLDER = new TextEncoder().encode(
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>SenstoSales</title><p>SenstoSales is running.</p></html>',
);

const send = (c: Context, bytes: Uint8Array, name: string): Response =>
  c.body(new Uint8Array(bytes), 200, { "content-type": getMimeType(name) ?? "application/octet-stream" });

export function spa(root: string): MiddlewareHandler {
  const files = createFsStorage(root);
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/api" || path.startsWith("/api/")) return next();

    let key: string;
    try {
      key = decodeURIComponent(path).slice(1);
    } catch {
      return next();
    }
    const name = key.slice(key.lastIndexOf("/") + 1);
    if (name.includes(".")) {
      // A refused key (`..`, backslashes, drive letters) is answered like a missing file.
      const file = await files.get(key).catch(() => null);
      return file ? send(c, file, name) : next();
    }
    return send(c, (await files.get("index.html")) ?? PLACEHOLDER, "index.html");
  };
}
