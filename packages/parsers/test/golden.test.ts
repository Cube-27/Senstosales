// Golden tests (SPEC-06 §6): every fixture page parses to its expected JSON, the fixtures cover each §6 category,
// and no input string makes a parser throw.
import { readFileSync, readdirSync } from "node:fs";

import { fyOf } from "@senstosales/domain";
import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { parsePo, parseSrv, zPoDocument, zSrvFile } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

/** Each page of a fixture folder with its expected JSON as on disk (`wire`) and decoded (`doc`). */
function load<S extends z.ZodType>(kind: "po" | "srv", schema: S) {
  const files = readdirSync(new URL(`${kind}/`, FIXTURES)).toSorted();
  const read = (file: string): string => readFileSync(new URL(`${kind}/${file}`, FIXTURES), "utf8");
  const fixtures = files
    .filter((file) => file.endsWith(".html"))
    .map((file) => {
      const name = file.slice(0, -".html".length);
      const wire: unknown = JSON.parse(read(`${name}.expected.json`));
      return { name, html: read(file), wire, doc: schema.parse(wire) as z.output<S> };
    });
  return { files, fixtures };
}

const PO = load("po", zPoDocument);
const SRV = load("srv", zSrvFile);
type Po = (typeof PO.fixtures)[number];
type Srv = (typeof SRV.fixtures)[number];

describe("fixture files", () => {
  it.each([PO, SRV])("every page has its expected JSON and nothing else is in the folder", ({ files, fixtures }) => {
    expect(files).toEqual(fixtures.flatMap(({ name }) => [`${name}.expected.json`, `${name}.html`]));
  });

  it("there are about 40 PO and 30 SRV fixtures (SPEC-06 §2)", () => {
    expect(PO.fixtures.length).toBeGreaterThanOrEqual(40);
    expect(SRV.fixtures.length).toBeGreaterThanOrEqual(30);
  });

  // Decoding then encoding gives the file back: its values are valid and written in canonical form.
  it.each(PO.fixtures)("po/$name.expected.json is canonical", ({ wire, doc }) => {
    expect(z.encode(zPoDocument, doc)).toEqual(wire);
  });
  it.each(SRV.fixtures)("srv/$name.expected.json is canonical", ({ wire, doc }) => {
    expect(z.encode(zSrvFile, doc)).toEqual(wire);
  });
});

describe("golden", () => {
  it.each(PO.fixtures)("parsePo: $name", ({ html, doc }) => {
    expect(parsePo(html)).toEqual({ ok: true, value: doc });
  });
  it.each(SRV.fixtures)("parseSrv: $name", ({ html, doc }) => {
    expect(parseSrv(html)).toEqual({ ok: true, value: doc });
  });
});

const lots = ({ doc }: Po) => doc.items.flatMap((item) => item.lots);
const srvItems = ({ doc }: Srv) => doc.flatMap((srv) => srv.items);

/** Some challan number is used in two financial years. */
function challanInTwoFys(f: Srv): boolean {
  const fys = new Map<string, Set<string>>();
  for (const { challanNo, challanDate } of srvItems(f)) {
    if (challanNo === null || challanDate === null) continue;
    fys.set(challanNo, (fys.get(challanNo) ?? new Set()).add(fyOf(challanDate)));
  }
  return [...fys.values()].some((set) => set.size > 1);
}

/**
 * SPEC-06 §6 coverage, each category as a test over the fixtures. The page era is not in the document, so it is
 * read from the markup: the PO DATE value beside its label (era 1) or below it (era 2).
 */
const PO_CATEGORIES: Record<string, (f: Po) => boolean> = {
  "era 1 page (value beside its label, DD/MM/YYYY)": ({ html }) =>
    /<td>PO DATE<\/td><td>\d\d\/\d\d\/\d{4}<\/td>/.test(html),
  "era 2 page (value below its label, DD-MON-YY)": ({ html }) =>
    /<td>PURCHASE ORDER<\/td><td>PO DATE<\/td>.*<\/tr>\s*<tr><td>\d+<\/td><td>\d\d-[A-Z]{3}-\d\d<\/td>/.test(html),
  GEMC: ({ doc }) => doc.gemcNumber !== null,
  "multi-item": ({ doc }) => doc.items.length > 1,
  "multi-lot": ({ doc }) => doc.items.some((item) => item.lots.length > 1),
  "short-closed (entry-allow note)": (f) => lots(f).some((lot) => lot.entryAllowNote !== null),
  amended: ({ doc }) => doc.amendNo > 0,
  "legacy misread: a description row naming item 100+ (EC-23)": ({ doc }) =>
    doc.items.some((item) => /^\d{3} /.test(item.description)),
  "legacy misread: a drawing number after `DRG NO :` (D-0113)": ({ html, doc }) =>
    html.includes("DRG NO :") && doc.items.some((item) => item.drawingNo !== null),
};

const SRV_CATEGORIES: Record<string, (f: Srv) => boolean> = {
  "layout A (accepted quantity column)": (f) => srvItems(f).some((item) => item.acceptedQty !== null),
  "layout B (no accepted quantity column)": (f) =>
    srvItems(f).every((item) => item.acceptedQty === null) && !/ACPT|ACCEPTED/i.test(f.html),
  "repeated challan number across FYs": challanInTwoFys,
  "a commented-out older table": ({ html }) => /<!--(?:(?!-->)[^])*SRV NO/.test(html),
  "several SRVs in one file": ({ doc }) => doc.length > 1,
};

describe("fixture coverage (SPEC-06 §6)", () => {
  it.each(Object.entries(PO_CATEGORIES))("PO: %s", (_, covers) => {
    expect(PO.fixtures.some(covers)).toBe(true);
  });
  it.each(Object.entries(SRV_CATEGORIES))("SRV: %s", (_, covers) => {
    expect(SRV.fixtures.some(covers)).toBe(true);
  });
});

describe("the parsers never throw (SPEC-06 §4.4)", () => {
  const pages = [...PO.fixtures, ...SRV.fixtures].map((f) => f.html);
  const tag = fc.constantFrom("<table>", "</table>", "<tr>", "</tr>", "<td>", "</td>", "<th>", "<!--", "-->", "&nbsp;");
  const word = fc.constantFrom("PURCHASE ORDER", "PO DATE", "MATERIAL CODE", "PO ITM", "SRV NO", "LOT NO", "10", "1.5");
  const html = fc.array(fc.oneof(tag, word, fc.string()), { maxLength: 60 }).map((parts) => parts.join(""));
  const cut = fc.constantFrom(...pages).chain((page) => fc.nat({ max: page.length }).map((n) => page.slice(0, n)));

  it.each([
    ["random strings and HTML-like text", fc.oneof(fc.string(), html)],
    ["every fixture cut short at any point", cut],
  ])("on %s", (_, input) => {
    fc.assert(
      fc.property(input, (text) => {
        parsePo(text);
        parseSrv(text);
      }),
      { numRuns: 300 },
    );
  });
});
