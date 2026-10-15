// INV-66 (SPEC-14 §2): screens build on the shared components, not on raw HTML controls. Rebuilt from the legacy
// validate-components rule: outside `components/common` and `components/ui` (where the shared components are
// built), no `<button>` (except a `role="switch"` toggle) and no `<input>`; use `Button` and `Input`.
// ARCHITECTURE §12.3, everywhere: an icon-only `Button` (`size="icon"` or `"icon-sm"`) has an `aria-label`.
// Usage: node tools/checks/src/validate-components.ts (from the repo root)
import { type Finding, lineAt, runCheck, type Source, WEB_SRC } from "./design.ts";

const SHARED = [`${WEB_SRC}/components/common/`, `${WEB_SRC}/components/ui/`];
const RAW: ReadonlyArray<[RegExp, string]> = [
  [/<button\b(?![^>]*\brole=["']switch["'])[^>]*>/g, "raw-button"],
  [/<input\b[^>]*>/g, "raw-input"],
];
const ICON_SIZE = /\bsize=(?:["']icon(?:-sm)?["']|\{["']icon(?:-sm)?["']\})/;
const NAMED = /\baria-label(?:ledby)?=/;

/** The JSX opening tag starting at `start` (`<Button … >`), read past `>` inside `{…}` and quotes. */
function openingTag(text: string, start: number): string {
  let depth = 0;
  let quote = "";
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

function unnamedIconButtons(source: Source): Finding[] {
  return Array.from(source.text.matchAll(/<Button\b/g)).flatMap((m) => {
    const tag = openingTag(source.text, m.index);
    if (!ICON_SIZE.test(tag) || NAMED.test(tag)) return [];
    return [{ path: source.path, line: lineAt(source.text, m.index), rule: "unnamed-icon-button", detail: tag }];
  });
}

export function checkComponents(source: Source): Finding[] {
  if (!source.path.endsWith(".tsx")) return [];
  const named = unnamedIconButtons(source);
  if (SHARED.some((dir) => source.path.startsWith(dir))) return named;
  const raw = RAW.flatMap(([pattern, rule]) =>
    Array.from(source.text.matchAll(pattern), (m) => ({
      path: source.path,
      line: lineAt(source.text, m.index),
      rule,
      detail: m[0],
    })),
  );
  return [...raw, ...named];
}

if (import.meta.main) process.exit(runCheck("validate-components", checkComponents));
