import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import { parseDenylist, scanFile } from "../src/real-data-scan.ts";

const none = parseDenylist(undefined);
// Synthetic GSTIN-shaped value assembled at runtime so this file itself stays clean.
const gstin = ["27", "ABCDE", "1234", "F", "1", "Z", "5"].join("");

describe("real-data-scan", () => {
  it("flags a GSTIN-shaped string with its line number", () => {
    expect(scanFile("a.ts", `ok\nconst g = "${gstin}";\n`, none)).toEqual([{ path: "a.ts", line: 2, rule: "gstin" }]);
  });

  it("ignores a GSTIN-shaped string on a line with the allow marker", () => {
    expect(scanFile("a.ts", `const g = "${gstin}"; // real-data-scan: allow`, none)).toEqual([]);
  });

  it.each([
    ["C:\\Downloads\\po.html", "local-data-path"], // real-data-scan: allow
    ["C:/Users/someone/Downloads/srv.html", "local-data-path"], // real-data-scan: allow
    ["copy db/business.db here", "local-data-path"], // real-data-scan: allow
    ["see business_development/plan.md", "local-data-path"], // real-data-scan: allow
  ])("flags %s as %s", (line, rule) => {
    expect(scanFile("notes.md", line, none)).toEqual([{ path: "notes.md", line: 1, rule }]);
  });

  it.each(["db/app.db", "data/x.sqlite", "x.sqlite3", "db/app.db-wal"])("flags the database file %s", (path) => {
    expect(scanFile(path, "", none)).toEqual([{ path, line: 0, rule: "database-file" }]);
  });

  it("flags a token whose lowercase SHA-256 is denylisted, and nothing else", () => {
    const denylist = parseDenylist(`${createHash("sha256").update("acmecorp").digest("hex")}\nnot-a-hash`);
    expect(denylist.size).toBe(1);
    expect(scanFile("a.md", "Supplier: AcmeCorp Ltd\nSupplier: Other Ltd", denylist)).toEqual([
      { path: "a.md", line: 1, rule: "denylisted-identifier" },
    ]);
  });

  it("passes clean synthetic content", () => {
    expect(scanFile("a.ts", "const po = 'PO-0001'; // example.test\n", none)).toEqual([]);
  });
});
