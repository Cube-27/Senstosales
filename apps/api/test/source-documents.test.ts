// SPEC-08 PR 2: raw HTML is stored through Storage and recorded in `source_document` before it is parsed (INV-107).
// Real node:sqlite and an in-memory Storage; nothing of ours is mocked.
import { auditLog, sourceDocument } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { ValidationError } from "../src/errors.ts";
import { storeSourceDocument } from "../src/services/source-documents.ts";
import { fixedClock, memoryStorage, supplierDb, NOW, SUPPLIER } from "./service-deps.ts";

let db: NodeDb;
let storage: ReturnType<typeof memoryStorage>;
let deps: Parameters<typeof storeSourceDocument>[0];
const ctx = { supplierId: SUPPLIER, actor: "admin", jobId: null };

beforeEach(async () => {
  db = await supplierDb();
  storage = memoryStorage();
  deps = { db, storage, clock: fixedClock };
});
afterEach(() => db.close());

const rows = () => db.query(db.build.select().from(sourceDocument));
const text = (key: string) => new TextDecoder().decode(storage.files.get(key));

describe("storeSourceDocument", () => {
  test("stores the bytes under the PO's key and records them, whatever the HTML holds", async () => {
    // Not a BHEL page: nothing here parses it, so even a page a parser would refuse is kept for a later re-parse.
    const stored = await storeSourceDocument(deps, { kind: "po", key: "4500001", html: "abc" }, ctx);

    expect(text("html/po/4500001.html")).toBe("abc");
    expect(await rows()).toEqual([
      {
        id: stored.id,
        supplierId: "S1",
        kind: "po",
        key: "4500001",
        storageKey: "html/po/4500001.html",
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        docDate: null,
        ingestedAt: NOW,
        jobId: null,
      },
    ]);
  });

  test("an SRV page goes under html/srv/ with the job that fetched it", async () => {
    const jobId = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";
    await storeSourceDocument(deps, { kind: "srv", key: "4500001", html: "<p>é</p>" }, { ...ctx, jobId });

    expect([...storage.files.keys()]).toEqual(["html/srv/4500001.html"]);
    expect(text("html/srv/4500001.html")).toBe("<p>é</p>");
    expect((await rows()).map((r) => [r.kind, r.storageKey, r.jobId])).toEqual([
      ["srv", "html/srv/4500001.html", jobId],
    ]);
  });

  test("writes one audit row in the same batch", async () => {
    const stored = await storeSourceDocument(deps, { kind: "po", key: "4500001", html: "abc" }, ctx);

    expect(await db.query(db.build.select().from(auditLog))).toEqual([
      {
        id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
        at: NOW,
        actor: "admin",
        action: "source_document.store",
        entityType: "source_document",
        entityId: stored.id,
        before: null,
        after: {
          kind: "po",
          key: "4500001",
          storageKey: "html/po/4500001.html",
          sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
        jobId: null,
      },
    ]);
  });

  test("storing the same PO again replaces the file and its row, so the row always describes the stored bytes", async () => {
    await storeSourceDocument(deps, { kind: "po", key: "4500001", html: "abc" }, ctx);
    const second = await storeSourceDocument(deps, { kind: "po", key: "4500001", html: "" }, ctx);

    expect(text("html/po/4500001.html")).toBe("");
    expect((await rows()).map((r) => [r.id, r.sha256])).toEqual([
      [second.id, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ]);
  });

  test.each(["../4500001", "45000011234", "", "PO-1", "4500001 "])(
    "a key that is not a PO number (%j) is refused and nothing is stored (C17)",
    async (key) => {
      await expect(storeSourceDocument(deps, { kind: "po", key, html: "abc" }, ctx)).rejects.toThrow(ValidationError);
      expect(storage.files.size).toBe(0);
      expect(await rows()).toEqual([]);
    },
  );
});
