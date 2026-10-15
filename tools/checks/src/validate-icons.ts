// INV-66 (SPEC-14 §2): icons come from one module, `src/lib/icons.ts`, which re-exports the lucide icons the app
// uses. Rebuilt from the legacy validate-icons rule (every icon imported from the icon module is exported by it);
// TypeScript now checks that, so the rule kept is the one it cannot check: no other file imports `lucide-react`.
// Usage: node tools/checks/src/validate-icons.ts (from the repo root)
import { type Finding, lineAt, report, type Source, WEB_SRC, webSources } from "./design.ts";

export const ICONS = `${WEB_SRC}/lib/icons.ts`;
const LUCIDE = /\b(?:from|import)\s*\(?\s*["']lucide-react(?:\/[^"']*)?["']/g;

export function checkIcons(source: Source): Finding[] {
  if (source.path === ICONS) return [];
  return Array.from(source.text.matchAll(LUCIDE), (m) => ({
    path: source.path,
    line: lineAt(source.text, m.index),
    rule: "icon-outside-registry",
    detail: "import icons from src/lib/icons.ts",
  }));
}

function main(): number {
  const sources = webSources();
  return report("validate-icons", sources.flatMap(checkIcons), sources.length);
}

if (import.meta.main) process.exit(main());
