// What the design validators share (SPEC-14 §2, INV-66): the web sources they scan, the tokens `globals.css`
// defines, the class strings in the sources, and the run-and-report loop (`path:line rule detail` per finding).
import { readFileSync } from "node:fs";

import { type Finding as RepoFinding, selectFiles } from "./real-data-scan.ts";

export const WEB_SRC = "apps/web/src";
export const GLOBALS_CSS = `${WEB_SRC}/styles/globals.css`;

/** A scanned file: its repo-relative path and its text. */
export interface Source {
  readonly path: string;
  readonly text: string;
}

export type Finding = RepoFinding & { readonly detail: string };

/** The tracked `.ts`/`.tsx` files under `apps/web/src`, generated files excepted. */
export function webSources(): Source[] {
  return selectFiles(false)
    .filter(({ path }) => path.startsWith(`${WEB_SRC}/`) && /\.tsx?$/.test(path) && !path.endsWith(".generated.ts"))
    .map(({ path, read }) => ({ path, text: read().toString("utf8") }));
}

/** Runs `check` over the web sources and prints the findings and a summary; 0 when there are none. */
export function runCheck(name: string, check: (source: Source) => Finding[]): number {
  const sources = webSources();
  const findings = sources.flatMap(check);
  for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule} ${f.detail}`);
  console.log(`${name}: ${findings.length} finding(s) in ${sources.length} file(s)`);
  return findings.length === 0 ? 0 : 1;
}

export const readGlobalsCss = (): string => readFileSync(GLOBALS_CSS, "utf8");

export const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

// ---- globals.css ----
// The file is plain CSS from one author: a block is found by its selector at the start of a line and ends at the
// first line that is a lone `}`.

const COLOUR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|color-mix\()/i;

/** The `--name: value` declarations of the block whose selector line is `selector {`. */
export function blockTokens(css: string, selector: string): Map<string, string> {
  const lines = css.split(/\r?\n/);
  const start = lines.indexOf(`${selector} {`);
  if (start === -1) return new Map();
  const tokens = new Map<string, string>();
  for (const line of lines.slice(start + 1, lines.indexOf("}", start))) {
    const m = /^\s*(--[\w-]+)\s*:\s*(.+);\s*$/.exec(line);
    if (m?.[1] && m[2]) tokens.set(m[1], m[2]);
  }
  return tokens;
}

/** The tokens of one block whose value is a colour literal (a `var()` alias follows its target). */
export function colourTokens(css: string, selector: string): Map<string, string> {
  return new Map([...blockTokens(css, selector)].filter(([, value]) => COLOUR_VALUE.test(value)));
}

/**
 * The custom properties `globals.css` defines in any block, the `--color-*` theme names (`bg-<name>`), and the
 * classes it writes out itself (`.role-page-title`, `.text-accent`, `.hover\:text-accent-hover`).
 */
export function designTokens(css: string): { properties: Set<string>; colours: Set<string>; classes: Set<string> } {
  const properties = new Set(Array.from(css.matchAll(/^\s*(--[\w-]+)\s*:/gm), (m) => m[1] ?? ""));
  const colours = new Set(
    [...blockTokens(css, "@theme").keys()].filter((n) => n.startsWith("--color-")).map((n) => n.slice(8)),
  );
  // `.hover\:text-accent-hover:hover` defines the class `hover:text-accent-hover`.
  const classes = new Set(
    Array.from(css.matchAll(/^\s*\.((?:[\w-]|\\:)+)/gm), (m) => (m[1] ?? "").replaceAll("\\:", ":")),
  );
  return { properties, colours, classes };
}

// ---- class strings ----

/** A string of class names in the source, with the line its class site starts on. */
export interface ClassString {
  readonly text: string;
  readonly line: number;
}

// Where class names are written: a `className` attribute, or the arguments of the class helpers.
const CLASS_SITE = /\bclassName\s*=\s*|\b(?:cn|cva|clsx|twMerge)\s*\(/g;
const LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`/g;
const LITERAL_HERE = new RegExp(LITERAL.source, "y");

/** The class strings of a source: string literals at each class site (template parts outside `${}`). */
export function classStrings(text: string): ClassString[] {
  const found: ClassString[] = [];
  let readTo = 0; // a site inside one already read (`className={cn(…)}`) is not read again
  for (const site of text.matchAll(CLASS_SITE)) {
    if (site.index < readTo) continue;
    const start = site.index + site[0].length;
    const opensCall = site[0].endsWith("(");
    const body = opensCall
      ? balanced(text, start - 1)
      : text[start] === "{"
        ? balanced(text, start)
        : literalAt(text, start);
    readTo = start + body.length;
    const line = lineAt(text, start);
    for (const lit of body.matchAll(LITERAL)) {
      found.push({ text: (lit[1] ?? lit[2] ?? lit[3] ?? "").replace(/\$\{[^}]*\}/g, " "), line });
    }
  }
  return found;
}

function literalAt(text: string, start: number): string {
  LITERAL_HERE.lastIndex = start;
  return LITERAL_HERE.exec(text)?.[0] ?? "";
}

/** The text of a bracketed expression starting at `open` (`{` or `(`), skipping brackets inside string literals. */
function balanced(text: string, open: number): string {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{" || ch === "(") depth++;
    else if ((ch === "}" || ch === ")") && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

/** One class name split into its variants (`dark`, `hover`, …), its utility, and whether it is marked important. */
export interface ClassToken {
  readonly token: string;
  readonly variants: string[];
  readonly utility: string;
  readonly important: boolean;
}

export function classTokens(classString: string): ClassToken[] {
  return classString
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      // Variants are separated by `:` outside brackets (`data-[state=open]:bg-surface`).
      const parts = token.split(/:(?![^[]*\])/);
      const last = parts.at(-1) ?? "";
      const utility = last.replace(/^!|!$/g, "");
      return { token, variants: parts.slice(0, -1), utility, important: utility !== last };
    });
}
