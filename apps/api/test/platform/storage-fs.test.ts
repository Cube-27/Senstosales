// SPEC-07 PR 2: the file-system Storage adapter keeps every key inside its root (INV-96).
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { createFsStorage } from "../../src/platform/node/storage-fs.ts";
import type { Storage } from "../../src/ports/storage.ts";

let parent: string;
let root: string;
let storage: Storage;
const bytes = (s: string) => new TextEncoder().encode(s);

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), "senstosales-storage-"));
  root = join(parent, "data");
  storage = createFsStorage(root);
});
afterEach(() => rm(parent, { recursive: true, force: true }));

describe("createFsStorage", () => {
  it("stores, reads, lists and deletes by key", async () => {
    await storage.put("html/po/1001.html", bytes("<p>one</p>"));
    await storage.put("html/po/1002.html", bytes("<p>two</p>"));
    await storage.put("html/srv/1001.html", bytes("<p>srv</p>"));

    expect(await storage.get("html/po/1001.html")).toEqual(bytes("<p>one</p>"));
    expect(await readFile(join(root, "html", "po", "1002.html"), "utf8")).toBe("<p>two</p>");
    expect(await storage.list("html/po/")).toEqual(["html/po/1001.html", "html/po/1002.html"]);
    expect(await storage.list("html/")).toEqual(["html/po/1001.html", "html/po/1002.html", "html/srv/1001.html"]);
    expect(await storage.list("html/po/1001")).toEqual(["html/po/1001.html"]);

    await storage.delete("html/po/1001.html");
    expect(await storage.get("html/po/1001.html")).toBeNull();
    expect(await storage.list("html/po/")).toEqual(["html/po/1002.html"]);
  });

  it("answers null, an empty list and a quiet delete for keys that hold nothing", async () => {
    expect(await storage.get("exports/none.xlsx")).toBeNull();
    expect(await storage.list("exports/")).toEqual([]);
    await expect(storage.delete("exports/none.xlsx")).resolves.toBeUndefined();
  });

  it.each([
    "../x",
    "html/../../x",
    "html/./x",
    "/etc/passwd",
    "\\x",
    "html\\..\\..\\x",
    "C:/x",
    "C:x",
    "//server/share/x",
    "",
    "html//x",
    "html/x\0",
  ])("refuses the key %j", async (key) => {
    await expect(storage.put(key, bytes("x"))).rejects.toThrow("Storage key not allowed");
    await expect(storage.get(key)).rejects.toThrow("Storage key not allowed");
    await expect(storage.delete(key)).rejects.toThrow("Storage key not allowed");
  });

  it.each(["../", "..", "/", "C:/", "html/../"])("refuses the prefix %j", async (prefix) => {
    await expect(storage.list(prefix)).rejects.toThrow("Storage key not allowed");
  });

  it("writes nothing outside the root for a refused key", async () => {
    await expect(storage.put("../outside.txt", bytes("x"))).rejects.toThrow();
    await expect(readFile(join(parent, "outside.txt"))).rejects.toThrow();
  });

  it("does not list files outside the prefix's folder", async () => {
    await writeFile(join(parent, "html-sibling.txt"), "x");
    await storage.put("html/a.html", bytes("a"));
    expect(await storage.list("")).toEqual(["html/a.html"]);
  });
});
