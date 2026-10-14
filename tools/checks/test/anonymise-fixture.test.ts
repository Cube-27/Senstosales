import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { anonymiseHtml, run } from "../src/anonymise-fixture.ts";
import { scanFile } from "../src/real-data-scan.ts";

// Planted values are assembled at run time so this file never contains them (SPEC-00 §4.6).
const cat = (...parts: string[]): string => parts.join("");
const GSTIN = cat("27", "ABCDE", "1234", "F", "1", "Z", "5");
const MOBILE = cat("98765", "43210");

/** A deterministic stand-in for crypto.randomInt (a small LCG). */
function seeded(seed = 1): (max: number) => number {
  let state = seed;
  return (max) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % max;
  };
}

const anonymise = (html: string, map = new Map<string, string>()): string => anonymiseHtml(html, map, seeded());
const row = (...cells: string[]): string => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

describe("anonymiseHtml keeps (INV-75)", () => {
  it.each([
    ["labels and column headers", row("PURCHASE ORDER", "PO DATE", "ORD QTY", "ENTRY ALLOW DATE", "SUPP NAME M/S")],
    ["quantities, rates and values with decimals", row("10.000", "1250.50", "2.5", "1,25,000.00")],
    ["whole-cell integers of up to four digits (item, lot, rate)", row("10", "1", "1250")],
    ["dates in the page formats", row("05/04/2023", "12-APR-24", "01/07/23", "PO DATE: 31-MAR-25")],
    ["entities and the entry-allow note", row("&nbsp;NOS&nbsp;", "PO Short Closed", "&#160;&amp;")],
    ["presentational attributes", `<table border="1" width="100%" class="grid"><tr><td colspan="11">10</td></tr>`],
    ["the doctype and a comment's labels", `<!DOCTYPE html><!-- ${row("SRV NO", "RECVD QTY")} -->`],
  ])("%s", (_, html) => {
    expect(anonymise(html)).toBe(html);
  });
});

describe("anonymiseHtml replaces (INV-75)", () => {
  it("a PO number with another number of the same length", () => {
    const out = anonymise(row("4100000101"));
    expect(out).toMatch(/^<tr><td>[1-9]\d{9}<\/td><\/tr>$/);
    expect(out).not.toContain("4100000101");
  });

  it("names letter for letter, keeping case and length", () => {
    const out = anonymise(row("Example Engineering Works"));
    expect(out).toMatch(/^<tr><td>[A-Z][a-z]{6} [A-Z][a-z]{10} [A-Z][a-z]{4}<\/td><\/tr>$/);
    expect(out).not.toMatch(/Example|Engineering|Works/);
  });

  it("a value the same way on every page that shares the mapping (PO and SRV)", () => {
    const map = new Map<string, string>();
    const po = anonymiseHtml(row("PURCHASE ORDER", "4100000101"), map, seeded(1));
    const srv = anonymiseHtml(row("PO NO", "4100000101"), map, seeded(99));
    expect(srv.replace("PO NO", "")).toBe(po.replace("PURCHASE ORDER", ""));
    expect([...map.keys()]).toEqual(["4100000101"]);
  });

  it("numbers inside text, such as a GEMC number, an address or a phone", () => {
    const out = anonymise(row("GEMC- 7731 dated 28-AUG-24", "Plot 14, Sector 5", "011-20000000"));
    expect(out).toMatch(/^<tr><td>GEMC- \d{4} [a-z]{5} 28-AUG-24<\/td><td>[A-Z][a-z]{3} \d{2}, [A-Z][a-z]{5} \d<\/td>/);
    expect(out).not.toMatch(/7731|Plot|14|Sector|20000000/);
  });

  it("whole-cell integers of five or more digits (codes, SRV and challan numbers)", () => {
    expect(anonymise(row("5000101"))).not.toContain("5000101");
  });

  it("identifiers and e-mail addresses, leaving no GSTIN or mobile number for the scan", () => {
    const html = row(`GSTIN ${GSTIN}`, `Mob ${MOBILE}`, "officer@example.com", "SYN100010");
    const out = anonymise(html);
    expect(out).toMatch(
      /^<tr><td>GSTIN \d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][0-9]<\/td><td>[A-Z][a-z]{2} \d{10}<\/td><td>[a-z]{7}@[a-z]{7}\.[a-z]{3}<\/td>/,
    );
    expect(out).not.toMatch(/officer|example|SYN/);
    expect(scanFile("packages/parsers/fixtures/po/x.html", Buffer.from(out))).toEqual([]);
  });

  it("text inside an HTML comment (pages embed an older table)", () => {
    expect(anonymise(`<!--${row("5000400", "Old Traders")}-->`)).not.toMatch(/5000400|Old|Traders/);
  });

  it("data in attributes such as href, value and title", () => {
    const out = anonymise(`<a href="view?po=4100000101" title="Example Works"><input value="5000101">`);
    expect(out).toMatch(
      /^<a href="[a-z]{4}\?[a-z]{2}=\d{10}" title="[A-Z][a-z]{6} [A-Z][a-z]{4}"><input value="\d{7}">$/,
    );
    expect(out).not.toMatch(/4100000101|Example|5000101/);
  });

  it("script bodies, which the parser never reads", () => {
    expect(anonymise(`<script type="text/javascript">var po = "4100000101";</script>`)).toBe(
      `<script type="text/javascript"></script>`,
    );
  });
});

describe("run", () => {
  function setup(): { root: string; corpus: string; mapPath: string; env: Record<string, string> } {
    const base = mkdtempSync(join(tmpdir(), "anon-"));
    const root = join(base, "repo");
    const corpus = join(base, "corpus");
    mkdirSync(join(root, "packages/parsers/fixtures/po"), { recursive: true });
    mkdirSync(join(corpus, "2024"), { recursive: true });
    writeFileSync(join(corpus, "2024/page.html"), row("PURCHASE ORDER", "4100000101", "Example Works"));
    const mapPath = join(base, "anon-map.json");
    return { root, corpus, mapPath, env: { SENSTO_CORPUS_DIR: corpus, SENSTO_ANON_MAP: mapPath } };
  }

  it("writes the fixture and the mapping, and reuses the mapping on the next page", () => {
    const { root, corpus, mapPath, env } = setup();
    expect(run({ args: ["2024/page.html", "po/first"], env, root, randomInt: seeded() })).toBe(0);
    const first = readFileSync(join(root, "packages/parsers/fixtures/po/first.html"), "utf8");
    expect(first).not.toMatch(/4100000101|Example|Works/);
    expect(Object.keys(JSON.parse(readFileSync(mapPath, "utf8")))).toEqual(["4100000101", "Example", "Works"]);

    writeFileSync(join(corpus, "2024/page.html"), row("PO NO", "4100000101"));
    expect(run({ args: ["2024/page.html", "po/second"], env, root, randomInt: seeded(7) })).toBe(0);
    const second = readFileSync(join(root, "packages/parsers/fixtures/po/second.html"), "utf8");
    expect(second.replace("PO NO", "")).toContain(/<td>(\d{10})<\/td>/.exec(first)?.[1]);
  });

  it.each([
    ["no SENSTO_CORPUS_DIR", { SENSTO_CORPUS_DIR: "" }, "po/x"],
    ["no SENSTO_ANON_MAP", { SENSTO_ANON_MAP: "" }, "po/x"],
    ["a fixture name outside po/ and srv/", {}, "../x"],
  ])("refuses %s and writes nothing", (_, override, name) => {
    const { root, env, mapPath } = setup();
    expect(run({ args: ["2024/page.html", name], env: { ...env, ...override }, root, randomInt: seeded() })).toBe(2);
    expect(existsSync(mapPath)).toBe(false);
  });

  it("refuses an input outside SENSTO_CORPUS_DIR", () => {
    const { root, env } = setup();
    expect(run({ args: ["../corpus-other/page.html", "po/x"], env, root, randomInt: seeded() })).toBe(2);
    expect(existsSync(join(root, "packages/parsers/fixtures/po/x.html"))).toBe(false);
  });

  it("refuses a mapping file inside the repo", () => {
    const { root, env } = setup();
    const inside = { ...env, SENSTO_ANON_MAP: join(root, "anon-map.json") };
    expect(run({ args: ["2024/page.html", "po/x"], env: inside, root, randomInt: seeded() })).toBe(2);
    expect(existsSync(join(root, "anon-map.json"))).toBe(false);
  });

  it("writes nothing when the output still matches the company-details file", () => {
    const { root, env, mapPath } = setup();
    mkdirSync(join(root, "tools/checks"), { recursive: true });
    writeFileSync(join(root, "tools/checks/company-details.local.txt"), "purchase order\n");
    expect(run({ args: ["2024/page.html", "po/x"], env, root, randomInt: seeded() })).toBe(1);
    expect(existsSync(join(root, "packages/parsers/fixtures/po/x.html"))).toBe(false);
    expect(existsSync(mapPath)).toBe(false);
  });
});
