// INV-66 (SPEC-14 §2): screens build on the shared components, not on raw HTML controls. Rebuilt from the legacy
// validate-components rule: outside `components/common` and `components/ui` (where the shared components are
// built), no `<button>` (except a `role="switch"` toggle) and no `<input>`; use `Button` and `Input`.
// Usage: node tools/checks/src/validate-components.ts (from the repo root)
import { type Finding, lineAt, runCheck, type Source, WEB_SRC } from "./design.ts";

const SHARED = [`${WEB_SRC}/components/common/`, `${WEB_SRC}/components/ui/`];
const RAW: ReadonlyArray<[RegExp, string]> = [
  [/<button\b(?![^>]*\brole=["']switch["'])[^>]*>/g, "raw-button"],
  [/<input\b[^>]*>/g, "raw-input"],
];

export function checkComponents(source: Source): Finding[] {
  if (!source.path.endsWith(".tsx") || SHARED.some((dir) => source.path.startsWith(dir))) return [];
  return RAW.flatMap(([pattern, rule]) =>
    Array.from(source.text.matchAll(pattern), (m) => ({
      path: source.path,
      line: lineAt(source.text, m.index),
      rule,
      detail: m[0],
    })),
  );
}

if (import.meta.main) process.exit(runCheck("validate-components", checkComponents));
