// Serves the built SPA from the API's own origin (ARCHITECTURE §9: one process, one port). A path that names a file
// gets that file; any other app path gets `index.html`, so the SPA's router handles it. A placeholder page stands in
// until `apps/web` is built.
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type { Context, MiddlewareHandler } from "hono";

import { isPlainName } from "./storage-fs.ts";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const PLACEHOLDER = new TextEncoder().encode(
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>SenstoSales</title><p>SenstoSales is running.</p></html>',
);

async function readOrNull(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

const send = (c: Context, bytes: Uint8Array<ArrayBuffer>, ext: string): Response =>
  c.body(bytes, 200, { "content-type": TYPES[ext] ?? "application/octet-stream" });

export function spa(root: string): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/api" || path.startsWith("/api/")) return next();

    let segments: string[];
    try {
      segments = decodeURIComponent(path).split("/").filter(Boolean);
    } catch {
      return next();
    }
    if (!segments.every(isPlainName)) return next();
    const ext = extname(path);
    if (ext !== "") {
      const file = await readOrNull(join(root, ...segments));
      return file ? send(c, file, ext) : next();
    }
    return send(c, (await readOrNull(join(root, "index.html"))) ?? PLACEHOLDER, ".html");
  };
}
