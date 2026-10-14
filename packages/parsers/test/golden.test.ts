// Golden tests (SPEC-06 §6): every fixture page parses to its expected JSON, the fixtures cover each §6 category,
// and no input string makes a parser throw.
import { readFileSync, readdirSync } from "node:fs";

import { fyOf } from "@senstosales/domain";
import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { loadPage } from "../src/html.ts";
import { parsePo, parseSrv, zPoDocument, zSrvFile } from "../src/index.ts";
import type { ParseResult } from "../src/types.ts";

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
  return { kind, files, fixtures };
}

const PO = load("po", zPoDocument);
const SRV = load("srv", zSrvFile);
type Po = (typeof PO.fixtures)[number];
type Srv = (typeof SRV.fixtures)[number];

describe("fixture files", () => {
  it.each([PO, SRV])(
    "$kind: every page has its expected JSON and nothing else is in the folder",
    ({ files, fixtures }) => {
      expect(files).toEqual(fixtures.flatMap(({ name }) => [`${name}.expected.json`, `${name}.html`]));
    },
  );

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

/** The cells of the first table row holding a `label` cell, and of the row below it. */
function rowWith(html: string, label: string): [string[], string[]] | undefined {
  for (const table of loadPage(html)) {
    const r = table.findIndex((row) => row.includes(label));
    if (r !== -1) return [table[r] ?? [], table[r + 1] ?? []];
  }
  return undefined;
}

/** The PO DATE value as printed: beside its label (era 1) or below it (era 2). */
function poDateCell(html: string, era: 1 | 2): string | undefined {
  const rows = rowWith(html, "PO DATE");
  const c = rows?.[0].indexOf("PO DATE") ?? -1;
  return era === 1 ? rows?.[0][c + 1] : rows?.[1][c];
}

/** The text after `DRG NO :` in a description; legacy read nothing there (D-0113). */
const DRG_NO_COLON = /DRG NO : (\S+)/;

/** SPEC-06 §6 coverage, each category as a test over the fixtures. The page era is read from the cell layout. */
const PO_CATEGORIES: Record<string, (f: Po) => boolean> = {
  "era 1 page (value beside its label, DD/MM/YYYY)": ({ html }) =>
    /^\d\d\/\d\d\/\d{4}$/.test(poDateCell(html, 1) ?? ""),
  "era 2 page (value below its label, DD-MON-YY)": ({ html }) => /^\d\d-[A-Z]{3}-\d\d$/.test(poDateCell(html, 2) ?? ""),
  GEMC: ({ doc }) => doc.gemcNumber !== null,
  "multi-item": ({ doc }) => doc.items.length > 1,
  "multi-lot": ({ doc }) => doc.items.some((item) => item.lots.length > 1),
  "short-closed (entry-allow note)": (f) => lots(f).some((lot) => lot.entryAllowNote !== null),
  amended: ({ doc }) => doc.amendNo > 0,
  "legacy misread: a description row naming another item numbered 100+ (EC-23)": ({ doc }) =>
    doc.items.some((item) =>
      doc.items.some(
        (other) => other !== item && other.poItemNo >= 100 && item.description.startsWith(`${other.poItemNo} `),
      ),
    ),
  "legacy misread: a drawing number after `DRG NO :` (D-0113)": ({ doc }) =>
    doc.items.some((item) => {
      const token = DRG_NO_COLON.exec(item.description)?.[1];
      return token !== undefined && (item.drawingNo ?? "").split(", ").includes(token);
    }),
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
  /** A value, or a failure with a code and a message: never undefined or a half-built result. */
  const isResult = (r: ParseResult<unknown>): boolean =>
    r.ok ? r.value !== undefined : typeof r.error.code === "string" && r.error.message !== "";
  const tag = fc.constantFrom("<table>", "</table>", "<tr>", "</tr>", "<td>", "</td>", "<th>", "<!--", "-->", "&nbsp;");
  const word = fc.constantFrom("PURCHASE ORDER", "PO DATE", "MATERIAL CODE", "PO ITM", "SRV NO", "LOT NO", "10", "1.5");
  const html = fc.array(fc.oneof(tag, word, fc.string()), { maxLength: 60 }).map((parts) => parts.join(""));
  const cut = fc.constantFrom(...pages).chain((page) => fc.nat({ max: page.length }).map((n) => page.slice(0, n)));

  it.each([
    ["random strings and HTML-like text", fc.oneof(fc.string(), html)],
    ["every fixture cut short at any point", cut],
  ])("on %s", (_, input) => {
    fc.assert(
      fc.property(input, (text) => isResult(parsePo(text)) && isResult(parseSrv(text))),
      { numRuns: 300 },
    );
  });
});
