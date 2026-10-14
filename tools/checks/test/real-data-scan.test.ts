import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { applyAllowlist, parseAllowlist, scanFile, selectFiles } from "../src/real-data-scan.ts";

// Planted values are assembled at run time so this file never contains them (SPEC-00 §4.6).
const cat = (...parts: string[]): string => parts.join("");
const text = (s: string): Buffer => Buffer.from(s, "utf8");
const GSTIN = cat("27", "ABCDE", "1234", "F", "1", "Z", "5");

describe("scanFile", () => {
  it("flags a GSTIN-shaped string with its line number", () => {
    expect(scanFile("a.ts", text(`ok\nconst g = "${GSTIN}";\n`))).toEqual([{ path: "a.ts", line: 2, rule: "gstin" }]);
  });

  it.each([
    ["lowercase", GSTIN.toLowerCase()],
    ["glued to underscores", `id_${GSTIN}_x`],
  ])("flags a GSTIN %s", (_case, value) => {
    expect(scanFile("a.ts", text(value))).toEqual([{ path: "a.ts", line: 1, rule: "gstin" }]);
  });

  it("does not flag a GSTIN-shaped run inside a longer alphanumeric token", () => {
    expect(scanFile("a.ts", text(`A${GSTIN}9`))).toEqual([]);
  });

  it("scans UTF-16 text with a byte-order mark", () => {
    const body = Buffer.from(`a,b\n1,${GSTIN}\n`, "utf16le");
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
    const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(body).swap16()]);
    expect(scanFile("le.csv", le)).toEqual([{ path: "le.csv", line: 2, rule: "gstin" }]);
    expect(scanFile("be.csv", be)).toEqual([{ path: "be.csv", line: 2, rule: "gstin" }]);
    expect(scanFile("odd.csv", Buffer.concat([be, Buffer.from([0x41])]))).toEqual([
      { path: "odd.csv", line: 2, rule: "gstin" },
    ]);
  });

  const zip = Buffer.from([0x50, 0x4b, 3, 4, 0]);
  it.each(["exports/report.xlsx", "docs/po.pdf", "a.zip", "Book.XLS", "letter.docx"])(
    "flags the document file %s outside the template and golden folders",
    (path) => {
      expect(scanFile(path, zip)).toEqual([{ path, line: 0, rule: "document-outside-fixtures" }]);
    },
  );

  it.each(["packages/documents/templates/dc.xlsx", "packages/documents/test/reports/ledger.xlsx"])(
    "accepts the document file %s in the template and golden folders",
    (path) => {
      expect(scanFile(path, zip)).toEqual([]);
    },
  );

  it.each([
    cat("C:", "\\", "Downloads\\po.html"),
    cat("D:/", "Downloads/srv.html"),
    cat("C:", "\\", "Users\\someone\\notes.txt"),
    cat("see /", "home/someone/data"),
    cat("path='/", "Users/someone/x'"),
    cat("copy db/", "business", ".db here"),
    cat("see ", "business", "_development/plan.md"),
  ])("flags the local data path in %s", (line) => {
    expect(scanFile("notes.md", text(line))).toEqual([{ path: "notes.md", line: 1, rule: "local-data-path" }]);
  });

  it.each(["db/app.db", "data/x.sqlite", "x.sqlite3", "db/app.db-wal"])("flags the database file %s", (path) => {
    expect(scanFile(path, text(""))).toEqual([{ path, line: 0, rule: "database-file" }]);
  });

  it("flags a file with the SQLite header whatever its extension", () => {
    const sqlite = Buffer.concat([Buffer.from(cat("SQLite", " format 3"), "latin1"), Buffer.from([0, 1, 2])]);
    expect(scanFile("assets/data.bin", sqlite)).toEqual([{ path: "assets/data.bin", line: 0, rule: "database-file" }]);
  });

  it("flags HTML outside the fixture folders and accepts it inside them", () => {
    expect(scanFile("docs/po.html", text("<p>x</p>"))).toEqual([
      { path: "docs/po.html", line: 0, rule: "html-outside-fixtures" },
    ]);
    expect(scanFile("packages/parsers/fixtures/po-1.html", text("<p>x</p>"))).toEqual([]);
    expect(scanFile("packages/scraper/fixtures/login.htm", text("<p>x</p>"))).toEqual([]);
  });

  it("passes clean synthetic content and repo-relative paths", () => {
    expect(scanFile("a.ts", text("const po = 'PO-0001'; // example.test, tools/checks/src\n"))).toEqual([]);
  });

  it("skips binary content that is not a database", () => {
    expect(scanFile("logo.png", Buffer.from([0x89, 0x50, 0, ...Buffer.from(GSTIN)]))).toEqual([]);
  });
});

describe("allowlist", () => {
  it("parses path:rule entries, ignoring comments and blank lines", () => {
    expect([...parseAllowlist("# header\n\n.gitignore:local-data-path  # names what it keeps out\n")]).toEqual([
      ".gitignore:local-data-path",
    ]);
  });

  it("drops only findings whose exact path and rule are listed", () => {
    const findings = [
      { path: ".gitignore", line: 3, rule: "local-data-path" },
      { path: ".gitignore", line: 4, rule: "gstin" },
      { path: "README.md", line: 1, rule: "local-data-path" },
    ];
    expect(applyAllowlist(findings, new Set([".gitignore:local-data-path"]))).toEqual(findings.slice(1));
  });
});

describe("selectFiles --staged", () => {
  it("lists staged added and modified files with their staged content, not deleted or unstaged ones", () => {
    const repo = mkdtempSync(join(tmpdir(), "scan-"));
    const run = (...args: string[]) => execFileSync("git", args, { cwd: repo });
    run("init", "-q");
    run("config", "user.email", "t@example.test");
    run("config", "user.name", "t");
    writeFileSync(join(repo, "kept.txt"), "v1");
    writeFileSync(join(repo, "gone.txt"), "x");
    run("add", ".");
    run("commit", "-qm", "init");
    writeFileSync(join(repo, "kept.txt"), "staged");
    writeFileSync(join(repo, "new.txt"), "new");
    run("add", "kept.txt", "new.txt");
    run("rm", "-q", "gone.txt");
    writeFileSync(join(repo, "kept.txt"), "unstaged edit");
    writeFileSync(join(repo, "untracked.txt"), "u");

    const cwd = process.cwd();
    process.chdir(repo);
    try {
      const files = selectFiles(true).map((f) => [f.path, f.read().toString("utf8")]);
      expect(files).toEqual([
        ["kept.txt", "staged"],
        ["new.txt", "new"],
      ]);
    } finally {
      process.chdir(cwd);
    }
  });
});
