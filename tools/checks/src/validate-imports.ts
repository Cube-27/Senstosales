// INV-66 (SPEC-14 §2, ARCHITECTURE §12.3): shared UI comes from the one registry, `components/common/index.ts`.
// Rebuilt from the legacy validate-imports rule (no deep imports past a barrel), for the new layout: outside the
// registry folder, nothing imports a file inside it other than its index, nothing outside `components/common` and
// `components/ui` imports a generated primitive, and nothing declares a local copy of a registry export.
// Usage: node tools/checks/src/validate-imports.ts (from the repo root)
import { readFileSync } from "node:fs";
import { posix } from "node:path";

import { type Finding, lineAt, report, type Source, WEB_SRC, webSources } from "./design.ts";

const COMMON = `${WEB_SRC}/components/common`;
const UI = `${WEB_SRC}/components/ui`;
const REGISTRY = `${COMMON}/index.ts`;
const IMPORT = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g;

const inside = (path: string, dir: string): boolean => path.startsWith(`${dir}/`);

/** The names the registry exports (`export { A, B as C } from …`, `export function A`, `export const A`). */
export function registryNames(registry: string): Set<string> {
  const names = new Set<string>();
  for (const [, list] of registry.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of (list ?? "").split(",")) {
      const name = item
        .trim()
        .split(/\s+as\s+/)
        .at(-1)
        ?.replace(/^type\s+/, "");
      if (name) names.add(name);
    }
  }
  for (const [, name] of registry.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)) names.add(name ?? "");
  return names;
}

export function checkImports(source: Source, registry: Set<string>): Finding[] {
  if (inside(source.path, COMMON)) return [];
  const findings: Finding[] = [];
  const at = (index: number, rule: string, detail: string): void => {
    findings.push({ path: source.path, line: lineAt(source.text, index), rule, detail });
  };
  for (const m of source.text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? "";
    if (!spec.startsWith(".")) continue;
    const target = posix.join(posix.dirname(source.path), spec);
    if (inside(target, COMMON) && !/\/components\/common(\/index(\.ts)?)?$/.test(target))
      at(m.index, "deep-import", spec);
    else if (inside(target, UI) && !inside(source.path, UI)) at(m.index, "primitive-outside-registry", spec);
  }
  if (inside(source.path, UI)) return findings;
  for (const m of source.text.matchAll(/^\s*(?:export\s+)?(?:function|const|class)\s+(\w+)/gm)) {
    if (registry.has(m[1] ?? "")) at(m.index, "local-copy", m[1] ?? "");
  }
  return findings;
}

function main(): number {
  let registry = new Set<string>();
  try {
    registry = registryNames(readFileSync(REGISTRY, "utf8"));
  } catch {
    // No registry yet: only the import rules apply.
  }
  const sources = webSources();
  return report(
    "validate-imports",
    sources.flatMap((source) => checkImports(source, registry)),
    sources.length,
  );
}

if (import.meta.main) process.exit(main());
