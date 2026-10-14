// INV-75 (SPEC-06 §4.3, ARCHITECTURE §14.3): turns one BHEL page from the local corpus into a parser fixture. Every
// name, number and identifier becomes an invented value of the same shape (digit for digit, letter for letter, case
// kept); the markup, the page's labels and column headers, the quantities and the dates stay. The same value maps to
// the same replacement on every page through a mapping file kept outside the repo (SENSTO_ANON_MAP), so a PO and its
// SRV file still agree. The output must pass the real-data scan and is reviewed before commit.
// Usage (from the repo root): node tools/checks/src/anonymise-fixture.ts <page under SENSTO_CORPUS_DIR> <po|srv>/<name>
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { readCompanyDetails, scanFile } from "./real-data-scan.ts";

/** Original token -> replacement. */
export type AnonMap = Map<string, string>;
export type RandomInt = (max: number) => number;

// Words the BHEL pages print as labels, column headers, units and fixed notes (SPEC-06 §2). They carry no identity
// and the parser finds fields by them, so they are kept wherever they appear.
const VOCABULARY = new Set(
  `PURCHASE ORDER DETAILS PO DATE SUPP SUPPLIER NAME M S CODE TIN NO ECC MPCT ENQUIRY ENQ RC QUOTATION QUOT VALUE VAL
  NET FOB DVN DIV DIVISION AMEND REMARKS REMARK ORD TYPE STATUS EX RATE CURRENCY INSPECTION BY AT BHEL PHONE FAX EMAIL
  DESIGNATION ITM ITEM MATERIAL MTRL CAT QTY QUANTITY RCD RECD RECVD RECEIVED REJ REJECTED ACPT ACCEPTED LOT DELY
  ENTRY ALLOW DEST UNIT UOM DESCRIPTION DRG DRAWING TOTAL SRV NUMBER CHALLAN CHL DT INV INVOICE TAX PMIR FINANCE CNOTE
  RECEIPT REV REVISION GEMC GST GSTIN INR SHORT CLOSED NOS KG MTR SET EA PCS LTR JAN FEB MAR APR MAY JUN JUL AUG SEP
  OCT NOV DEC`.split(/\s+/),
);

// Attributes that only shape the page; every other attribute value (href, value, title, ...) is treated as text.
const LAYOUT_ATTRIBUTES = new Set(
  `align bgcolor border cellpadding cellspacing charset class color colspan content dir face height http-equiv id lang
  name nowrap rel rowspan scope size span style type valign width`.split(/\s+/),
);

// Kept as they are: entities, dates (DD/MM/YYYY, DD-MON-YY, DD/MM/YY), grouped or decimal numbers (quantities, rates,
// values). Anything else alphanumeric is a word or code to replace.
const TOKEN =
  /&#?\w+;|(?<![\w.])\d{1,2}[/.-](?:\d{1,2}|[A-Za-z]{3})[/.-](?:\d{4}|\d{2})(?![\w])|(?<![\d,])\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+\.\d+|[A-Za-z0-9]+/g;
const KEPT_TOKEN = /^(?:&|\d+[/.,-])/;
// A cell holding only a short integer is an item, lot or count, or a rate without paise: a quantity, not an identity.
const SHORT_INTEGER_CELL = /^\s*\d{1,4}\s*$/;
const HTML_PART = /<!--([\s\S]*?)(?:-->|$)|(<script\b[^>]*>)[\s\S]*?(?:<\/script\s*>|$)|(<[^>]*>)|([^<]+)|</gi;
const ATTRIBUTE = /(\s([^\s=>/]+)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const FIXTURE_NAME = /^(?:po|srv)\/[a-z0-9][a-z0-9-]*$/;
const FIXTURE_DIR = "packages/parsers/fixtures";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();
const DIGITS = "0123456789";

/** A random token of the same shape; a digit-only token never gains a leading zero. */
function sameShape(token: string, random: RandomInt): string {
  const digitsOnly = /^\d+$/.test(token);
  return [...token]
    .map((ch, i) => {
      const pool = /\d/.test(ch)
        ? digitsOnly && i === 0
          ? DIGITS.slice(1)
          : DIGITS
        : /[A-Z]/.test(ch)
          ? UPPER
          : LOWER;
      return pool[random(pool.length)];
    })
    .join("");
}

/** A replacement that differs from the original, is no label word and looks like no GSTIN or mobile number. */
function replacement(token: string, map: AnonMap, random: RandomInt): string {
  const known = map.get(token);
  if (known !== undefined) return known;
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = sameShape(token, random);
    const clean = scanFile("token.txt", Buffer.from(candidate)).length === 0;
    if (candidate !== token && !VOCABULARY.has(candidate.toUpperCase()) && clean) {
      map.set(token, candidate);
      return candidate;
    }
  }
  throw new Error(`no replacement found for a ${token.length}-character token`);
}

function anonymiseText(text: string, map: AnonMap, random: RandomInt): string {
  if (SHORT_INTEGER_CELL.test(text)) return text;
  return text.replace(TOKEN, (token) =>
    KEPT_TOKEN.test(token) || VOCABULARY.has(token.toUpperCase()) ? token : replacement(token, map, random),
  );
}

function anonymiseTag(tag: string, map: AnonMap, random: RandomInt): string {
  return tag.replace(ATTRIBUTE, (whole, prefix: string, name: string, dq?: string, sq?: string, bare?: string) => {
    if (LAYOUT_ATTRIBUTES.has(name.toLowerCase())) return whole;
    const value = anonymiseText(dq ?? sq ?? bare ?? "", map, random);
    return dq !== undefined ? `${prefix}"${value}"` : sq !== undefined ? `${prefix}'${value}'` : `${prefix}${value}`;
  });
}

/**
 * The page with every name, number and identifier replaced through `map` (which gains any new values), keeping the
 * markup, labels, quantities and dates. Comments are anonymised as markup; script bodies are dropped.
 */
export function anonymiseHtml(html: string, map: AnonMap, random: RandomInt): string {
  return html.replace(HTML_PART, (part, comment?: string, scriptOpen?: string, tag?: string, text?: string) => {
    if (comment !== undefined) return `<!--${anonymiseHtml(comment, map, random)}${part.endsWith("-->") ? "-->" : ""}`;
    if (scriptOpen !== undefined) return `${anonymiseTag(scriptOpen, map, random)}</script>`;
    if (tag !== undefined) return anonymiseTag(tag, map, random);
    if (text !== undefined) return anonymiseText(text, map, random);
    return part;
  });
}

const isInside = (dir: string, path: string): boolean => {
  const rel = relative(dir, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

const USAGE = "usage: node tools/checks/src/anonymise-fixture.ts <page under SENSTO_CORPUS_DIR> <po|srv>/<name>";

/** Writes `<repo>/packages/parsers/fixtures/<name>.html` and the updated mapping; returns the exit code. */
export function run(options: {
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  root: string;
  randomInt: RandomInt;
}): number {
  const [input, name] = options.args;
  const corpus = options.env["SENSTO_CORPUS_DIR"];
  const mapFile = options.env["SENSTO_ANON_MAP"];
  const fail = (message: string): number => (console.error(message), 2);
  if (!corpus || !mapFile || !input || !name)
    return fail(`${USAGE}\nSENSTO_CORPUS_DIR and SENSTO_ANON_MAP must be set`);
  if (!FIXTURE_NAME.test(name)) return fail(`fixture name must look like po/<name> or srv/<name>`);
  const source = resolve(corpus, input);
  if (!isInside(resolve(corpus), source)) return fail("the page must be inside SENSTO_CORPUS_DIR");
  if (isInside(resolve(options.root), resolve(mapFile))) return fail("SENSTO_ANON_MAP must be outside the repo");

  const map: AnonMap = existsSync(mapFile)
    ? new Map(Object.entries(JSON.parse(readFileSync(mapFile, "utf8")) as Record<string, string>))
    : new Map();
  // UTF-8 with replacement, as the parser decodes (ARCHITECTURE §7.1).
  const html = anonymiseHtml(new TextDecoder().decode(readFileSync(source)), map, options.randomInt);
  const fixture = `${FIXTURE_DIR}/${name}.html`;
  const findings = scanFile(fixture, Buffer.from(html), readCompanyDetails(options.root));
  if (findings.length > 0) {
    for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule}`);
    console.error("nothing written: review the page and the vocabulary");
    return 1;
  }
  writeFileSync(join(options.root, fixture), html);
  writeFileSync(mapFile, `${JSON.stringify(Object.fromEntries(map), null, 2)}\n`);
  console.log(`wrote ${fixture}; review it before committing`);
  return 0;
}

if (import.meta.main) {
  process.exit(run({ args: process.argv.slice(2), env: process.env, root: process.cwd(), randomInt }));
}
