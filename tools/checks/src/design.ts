// What the design validators share (SPEC-14 Â§2, INV-66): the web sources they scan, the class strings in those
// sources, the tokens `globals.css` defines, and the report format (`path:line rule detail` per finding).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { blockTokens } from "./css-tokens.ts";

export const WEB_SRC = "apps/web/src";
export const GLOBALS_CSS = `${WEB_SRC}/styles/globals.css`;

/** A scanned file: its repo-relative path with forward slashes, and its text. */
export interface Source {
  readonly path: string;
  readonly text: string;
}

export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly rule: string;
  readonly detail: string;
}

/** Every `.ts`/`.tsx` file under `root`, generated files excepted, in path order. */
export function webSources(root = WEB_SRC): Source[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((path) => join(root, path).replaceAll("\\", "/"))
    .filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".generated.ts"))
    .sort()
    .map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

export const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/**
 * The custom properties `globals.css` defines in any block, the `--color-*` theme names (`bg-<name>`), and the
 * utility classes it writes out itself (`.text-accent`, `.hover\:text-accent-hover`).
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

/** A string of class names in the source, with the line it starts on. */
export interface ClassString {
  readonly text: string;
  readonly line: number;
}

// Where class names are written: a `className` attribute, or the arguments of the class helpers.
const CLASS_SITE = /\bclassName\s*=\s*|\b(?:cn|cva|clsx|twMerge)\s*\(/g;
const LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`/g;
const LEADING_LITERAL = new RegExp(`^(?:${LITERAL.source})`);

/** The class strings of a source: string literals at each class site (template parts outside `${}`). */
export function classStrings(text: string): ClassString[] {
  const found: ClassString[] = [];
  let readTo = 0; // a site inside one already read (`className={cn(…)}`) is not read again
  for (const site of text.matchAll(CLASS_SITE)) {
    if (site.index < readTo) continue;
    const start = site.index + site[0].length;
    const body = site[0].endsWith("(")
      ? balanced(text, start - 1)
      : text[start] === "{"
        ? balanced(text, start)
        : (LEADING_LITERAL.exec(text.slice(start))?.[0] ?? "");
    readTo = start + body.length;
    for (const lit of body.matchAll(LITERAL)) {
      const value = (lit[1] ?? lit[2] ?? lit[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
      found.push({ text: value, line: lineAt(text, start) });
    }
  }
  return found;
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

/** One class name split into its variants (`dark`, `hover`, â€¦), its utility, and whether it is marked important. */
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

/** Prints the findings and a summary; 0 when there are none. */
export function report(name: string, findings: Finding[], scanned: number): number {
  for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule} ${f.detail}`);
  console.log(`${name}: ${findings.length} finding(s) in ${scanned} file(s)`);
  return findings.length === 0 ? 0 : 1;
}
