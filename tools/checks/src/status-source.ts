// INV-64 (SPEC-02 PR 5, C2): item and PO status are derived in one place, packages/domain/src/status.ts. Fails when
// a production source elsewhere declares a function named for item or PO status (`poStatus`, `computeItemStatus`,
// `po_status`) or produces a status value from a decision (`return "Closed"`, `? "Delivered"`, `= "Pending"`, SQL
// `THEN 'Closed'`). Comparing, listing or mapping the values is allowed: consumers call the domain functions.
// Usage: node tools/checks/src/status-source.ts (from the repo root)
import { PRODUCTION_SOURCE } from "./language.ts";
import { selectFiles } from "./real-data-scan.ts";

const isProductionTs = (path: string): boolean => PRODUCTION_SOURCE.test(path) && /\.tsx?$/.test(path);
const THE_ONE_SOURCE = "packages/domain/src/status.ts";
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
// Function declarations, function-valued bindings and class methods; group 1 is the name.
const DECLARATIONS = [
  /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|\(|<|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*(?:(?:public|private|protected|static|async|override)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;=]*)?\{\s*$/,
];
// `itemStatus`, `po_status`, `ItemStatus`, `getPOStatus`; not `jobStatus`, `repoStatus` or `PoStatusBadge`.
const isStatusName = (name: string): boolean =>
  /(?:^|_)(?:item|po)_?status$/i.test(name) || /(?:Item|Po|PO)Status$/.test(name);
// A status value as the outcome of a return, arrow, ternary, `??`, assignment or SQL CASE branch. Comparisons
// (`===`, `!==`), `case` labels, arrays and object maps don't match.
const PRODUCED_VALUE =
  /(?:\breturn|=>|\?|(?<![=!<>])=(?![=>])|\b(?:THEN|ELSE|then|else))\s*(["'`])(Pending|Delivered|Closed|Cancelled)\1/;

/** INV-64 findings for one file, as `path:line message (INV-64)`. */
export function statusViolations(path: string, text: string): string[] {
  if (!isProductionTs(path) || path === THE_ONE_SOURCE) return [];
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (COMMENT_LINE.test(line)) return [];
    const at = `${path}:${index + 1}`;
    const names = DECLARATIONS.map((pattern) => pattern.exec(line)?.[1]).filter((name) => name && isStatusName(name));
    const value = PRODUCED_VALUE.exec(line)?.[2];
    return [
      ...[...new Set(names)].map((name) => `${at} status function ${name} (INV-64)`),
      ...(value ? [`${at} status value "${value}" (INV-64)`] : []),
    ];
  });
}

function main(): number {
  const found = selectFiles(false).flatMap(({ path, read }) =>
    isProductionTs(path) ? statusViolations(path, read().toString("utf8")) : [],
  );
  for (const finding of found) console.error(finding);
  return found.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
