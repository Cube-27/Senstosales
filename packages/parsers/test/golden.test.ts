// Golden tests (SPEC-06 §6): every fixture page parses to its expected JSON, the fixtures cover each §6 category,
// and no input string makes a parser throw.
import { readFileSync, readdirSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { parsePo, parseSrv, zPoDocument, zSrvFile } from "../src/index.ts";
import type { PoDocument, SrvDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const KINDS = ["po", "srv"] as const;

const files = (kind: string): string[] => readdirSync(new URL(`${kind}/`, FIXTURES)).toSorted();
const names = (kind: string): string[] =>
  files(kind)
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.slice(0, -".html".length));
const read = (kind: string, file: string): string => readFileSync(new URL(`${kind}/${file}`, FIXTURES), "utf8");
const wire = (kind: string, name: string): unknown => JSON.parse(read(kind, `${name}.expected.json`));

const PO = names("po").map((name) => ({
  name,
  html: read("po", `${name}.html`),
  doc: zPoDocument.parse(wire("po", name)),
}));
const SRV = names("srv").map((name) => ({
  name,
  html: read("srv", `${name}.html`),
  file: zSrvFile.parse(wire("srv", name)),
}));

describe("fixture files", () => {
  it.each(KINDS)("%s: every page has its expected JSON and nothing else is in the folder", (kind) => {
    expect(files(kind)).toEqual(names(kind).flatMap((name) => [`${name}.expected.json`, `${name}.html`]));
  });

  it("there are about 40 PO and 30 SRV fixtures (SPEC-06 §2)", () => {
    expect([PO.length >= 40, SRV.length >= 30]).toEqual([true, true]);
  });

  it.each([
    ...names("po").map((name) => [`po/${name}`, zPoDocument, wire("po", name)] as const),
    ...names("srv").map((name) => [`srv/${name}`, zSrvFile, wire("srv", name)] as const),
  ])("%s.expected.json is canonical", (_, schema: z.ZodType, value) => {
    // Decoding then encoding gives the file back: its values are valid and written in canonical form.
    expect(z.encode(schema, schema.parse(value))).toEqual(value);
  });
});

describe("golden: parsePo", () => {
  it.each(PO.map((f) => [f.name, f] as const))("%s", (_, { html, doc }) => {
    expect(parsePo(html)).toEqual({ ok: true, value: doc });
  });
});

describe("golden: parseSrv", () => {
  it.each(SRV.map((f) => [f.name, f] as const))("%s", (_, { html, file }) => {
    expect(parseSrv(html)).toEqual({ ok: true, value: file });
  });
});

type Po = { name: string; html: string; doc: PoDocument };
type Srv = { name: string; html: string; file: SrvDocument[] };
const lots = (doc: PoDocument) => doc.items.flatMap((item) => item.lots);
/** The financial year (April to March) of an ISO date, as its starting year. */
const fyOf = (date: string): number => Number(date.slice(0, 4)) - (date.slice(5, 7) < "04" ? 1 : 0);

/** SPEC-06 §6 coverage, each category as a test over the fixture pages and their expected documents. */
const PO_CATEGORIES: Record<string, (f: Po) => boolean> = {
  "era 1 page (label beside its value, DD/MM/YYYY)": (f) => /<td>PO DATE<\/td><td>\d\d\/\d\d\/\d{4}<\/td>/.test(f.html),
  "era 2 page (label above its value, DD-MON-YY)": (f) =>
    /<td>PURCHASE ORDER<\/td><td>PO DATE<\/td>/.test(f.html) && /\d\d-[A-Z]{3}-\d\d/.test(f.html),
  GEMC: (f) => f.doc.gemcNumber !== null,
  "multi-item": (f) => f.doc.items.length > 1,
  "multi-lot": (f) => f.doc.items.some((item) => item.lots.length > 1),
  "short-closed (entry-allow note)": (f) => lots(f.doc).some((lot) => lot.entryAllowNote !== null),
  amended: (f) => f.doc.amendNo > 0,
  "legacy misread (EC-23, D-0113)": (f) => f.name.startsWith("legacy-"),
};

const SRV_CATEGORIES: Record<string, (f: Srv) => boolean> = {
  "layout A (accepted quantity column)": (f) => f.file.some((srv) => srv.items.some((i) => i.acceptedQty !== null)),
  "layout B (no accepted quantity column)": (f) =>
    f.html.includes("<th>RECEIVED QTY</th>") && !/ACPT|ACCEPTED/.test(f.html),
  "repeated challan number across FYs": (f) => {
    const items = f.file.flatMap((srv) => srv.items);
    return items.some((a) =>
      items.some(
        (b) =>
          a.challanNo === b.challanNo && a.challanDate && b.challanDate && fyOf(a.challanDate) !== fyOf(b.challanDate),
      ),
    );
  },
  "a commented-out older table": (f) => /<!--[^]*SRV NO[^]*-->/.test(f.html),
  "several SRVs in one file": (f) => f.file.length > 1,
};

describe("fixture coverage (SPEC-06 §6)", () => {
  it.each(Object.entries(PO_CATEGORIES))("PO: %s", (_, covers) => {
    expect(PO.filter(covers).length).toBeGreaterThan(0);
  });
  it.each(Object.entries(SRV_CATEGORIES))("SRV: %s", (_, covers) => {
    expect(SRV.filter(covers).length).toBeGreaterThan(0);
  });
});

describe("the parsers never throw (SPEC-06 §4.4)", () => {
  const isResult = (r: { ok: boolean }): boolean => typeof r.ok === "boolean";
  const pages = [...PO.map((f) => f.html), ...SRV.map((f) => f.html)];

  it("on random strings and random HTML-like text", () => {
    const tag = fc.constantFrom(
      "<table>",
      "</table>",
      "<tr>",
      "</tr>",
      "<td>",
      "</td>",
      "<th>",
      "<!--",
      "-->",
      "&nbsp;",
    );
    const word = fc.constantFrom(
      "PURCHASE ORDER",
      "PO DATE",
      "MATERIAL CODE",
      "PO ITM",
      "SRV NO",
      "LOT NO",
      "10",
      "1.5",
    );
    const html = fc.array(fc.oneof(tag, word, fc.string()), { maxLength: 60 }).map((parts) => parts.join(""));
    fc.assert(
      fc.property(fc.oneof(fc.string(), html), (text) => isResult(parsePo(text)) && isResult(parseSrv(text))),
      { numRuns: 300 },
    );
  });

  it("on every fixture cut short at any point", () => {
    const cut = fc.constantFrom(...pages).chain((page) => fc.nat({ max: page.length }).map((n) => page.slice(0, n)));
    fc.assert(
      fc.property(cut, (text) => isResult(parsePo(text)) && isResult(parseSrv(text))),
      { numRuns: 300 },
    );
  });
});
