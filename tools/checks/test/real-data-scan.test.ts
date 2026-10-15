import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { applyAllowlist, parseAllowlist, parseCompanyDetails, scanFile, selectFiles } from "../src/real-data-scan.ts";

// Planted values are assembled at run time so this file never contains them (SPEC-00 §4.6).
const cat = (...parts: string[]): string => parts.join("");
const text = (s: string): Buffer => Buffer.from(s, "utf8");
const GSTIN = cat("27", "ABCDE", "1234", "F", "1", "Z", "5");
const MOBILE = cat("98765", "43210");

/** A fresh git repository in a temp folder, with a runner for git commands in it. */
function gitRepo(): { repo: string; run: (...args: string[]) => Buffer } {
  const repo = mkdtempSync(join(tmpdir(), "scan-"));
  const run = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  run("init", "-q");
  run("config", "user.email", "t@example.test");
  run("config", "user.name", "t");
  return { repo, run };
}

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

  it("reports every rule that matches a line, so allowlisting one can't hide another", () => {
    const line = cat("C:", "\\", "Users\\someone\\", GSTIN, ".txt");
    expect(scanFile("a.md", text(line))).toEqual([
      { path: "a.md", line: 1, rule: "gstin" },
      { path: "a.md", line: 1, rule: "local-data-path" },
    ]);
  });

  it("flags the owner's private data folder", () => {
    expect(scanFile("a.md", text(cat("see ../Sensto", "Sales-private/x")))).toEqual([
      { path: "a.md", line: 1, rule: "private-repo-path" },
    ]);
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

describe("mobile rule", () => {
  it.each([
    ["bare", MOBILE],
    ["with +91", `+91${MOBILE}`],
    ["with +91 and a space", `+91 ${MOBILE}`],
    ["with a leading 0", `0${MOBILE}`],
    ["glued to letters", `tel${MOBILE}x`],
  ])("flags an Indian mobile number %s", (_case, value) => {
    expect(scanFile("a.md", text(`call ${value} now`))).toEqual([{ path: "a.md", line: 1, rule: "mobile" }]);
  });

  it.each([
    ["starting below 6", cat("58765", "43210")],
    ["nine digits", cat("98765", "4321")],
    ["inside a longer digit run", cat("1", MOBILE)],
    ["followed by a digit", cat(MOBILE, "7")],
    ["with a 91 prefix but no plus", cat("91", MOBILE)],
  ])("does not flag a number %s", (_case, value) => {
    expect(scanFile("a.md", text(value))).toEqual([]);
  });
});

describe("company details", () => {
  const details = parseCompanyDetails(cat("  Example ", "Traders Pvt\r\n\n", "12 Sample ", "Road\n   \n"));

  it("reads one trimmed, lowercased value per non-blank line", () => {
    expect(details).toEqual(["example traders pvt", "12 sample road"]);
  });

  it("flags a line containing a value, whatever its case, by line number only", () => {
    const content = text(cat("ok\nBilled to EXAMPLE ", "TRADERS PVT ltd\nship to 12 sample ", "road\n"));
    expect(scanFile("bill.csv", content, details)).toEqual([
      { path: "bill.csv", line: 2, rule: "company-details" },
      { path: "bill.csv", line: 3, rule: "company-details" },
    ]);
  });

  it("does not flag a line without any value, or anything when there are no values", () => {
    expect(scanFile("a.md", text("Example only\n"), details)).toEqual([]);
    expect(scanFile("a.md", text(cat("Example ", "Traders Pvt")), [])).toEqual([]);
  });
});

describe("allowlist", () => {
  it("parses path:rule entries, ignoring comments and blank lines", () => {
    expect([...parseAllowlist("# header\n\n.gitignore:local-data-path  # names what it keeps out\n")]).toEqual([
      ".gitignore:local-data-path",
    ]);
  });

  it.each([
    ["no justification", ".gitignore:local-data-path"],
    ["an empty justification", ".gitignore:local-data-path  #"],
    ["no rule", ".gitignore  # why"],
    ["an unknown rule", ".gitignore:no-such-rule  # why"],
    ["a space in the entry", ".git ignore:gstin  # why"],
  ])("rejects an entry with %s, naming its line", (_case, entry) => {
    expect(() => parseAllowlist(`# header\n${entry}\n`)).toThrow("real-data-allow.txt:2");
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
    const { repo, run } = gitRepo();
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

describe("real-data-scan --staged (the pre-commit hook)", () => {
  const SCRIPT = fileURLToPath(new URL("../src/real-data-scan.ts", import.meta.url));
  const VALUE = cat("Example ", "Traders");

  /** Stages `files` in a fresh repo and runs the scan there as the hook does. The allowlist on disk is `allow` (empty by
   * default), left unstaged unless it is one of `files`. */
  function hook(files: Record<string, string>, companyDetails?: string, allow = "# none\n") {
    const { repo, run } = gitRepo();
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    };
    write("tools/checks/real-data-allow.txt", allow);
    if (companyDetails !== undefined) write("tools/checks/company-details.local.txt", companyDetails);
    for (const [path, content] of Object.entries(files)) write(path, content);
    run("add", "--", ...Object.keys(files));
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT, "--staged"], { cwd: repo, stdio: "pipe" });
      return { status: 0, stdout: stdout.toString(), stderr: "" };
    } catch (error) {
      const e = error as { status: number; stdout: Buffer; stderr: Buffer };
      return { status: e.status, stdout: e.stdout.toString(), stderr: e.stderr.toString() };
    }
  }

  it("is run by the committed pre-commit hook, through vp staged", async () => {
    // Without the hook script the Vite+ dispatcher exits 0 and nothing is scanned at commit time.
    const hookScript = readFileSync(new URL("../../../.vite-hooks/pre-commit", import.meta.url), "utf8");
    expect(hookScript.split(/\r?\n/)).toContain("vp staged");
    const { default: config } = await import(new URL("../../../vite.config.ts", import.meta.url).href);
    expect(config.staged["*"]()).toBe("node tools/checks/src/real-data-scan.ts --staged");
  });

  it("blocks a staged value from the local company-details file without printing it", () => {
    const result = hook({ "notes.md": `ok\nsold by ${VALUE.toUpperCase()}\n` }, `${VALUE}\n`);
    expect(result).toEqual({
      status: 1,
      stdout: "real-data-scan: 1 finding(s)\n",
      stderr: "notes.md:2 company-details\n",
    });
  });

  it("blocks a staged mobile number", () => {
    expect(hook({ "a.txt": `call ${MOBILE}\n` })).toEqual({
      status: 1,
      stdout: "real-data-scan: 1 finding(s)\n",
      stderr: "a.txt:1 mobile\n",
    });
  });

  // CodeAnt on #3: the allowlist was read from the working tree, so an unstaged entry excused a staged file.
  it("ignores an allowlist entry that is not staged", () => {
    const result = hook({ "a.txt": `call ${MOBILE}\n` }, undefined, "a.txt:mobile  # synthetic\n");
    expect(result).toEqual({ status: 1, stdout: "real-data-scan: 1 finding(s)\n", stderr: "a.txt:1 mobile\n" });
  });

  it("honours a staged allowlist entry", () => {
    const allow = "a.txt:mobile  # synthetic\n";
    const result = hook({ "a.txt": `call ${MOBILE}\n`, "tools/checks/real-data-allow.txt": allow }, undefined, allow);
    expect(result).toEqual({ status: 0, stdout: "real-data-scan: 0 finding(s)\n", stderr: "" });
  });

  it("passes silently when the company-details file is absent", () => {
    expect(hook({ "notes.md": `sold by ${VALUE}\n` })).toEqual({
      status: 0,
      stdout: "real-data-scan: 0 finding(s)\n",
      stderr: "",
    });
  });
});
