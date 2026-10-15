// INV-66, C7 (SPEC-14 §2): text style comes from the `role-*` classes in `globals.css`. Rebuilt from the legacy
// validate-typography rules: no deprecated class systems; a class string with a role class adds no local size,
// weight, line-height, letter-spacing, case or non-state colour; no role class with `/opacity`. Also: a role class
// names one that `globals.css` defines.
// Usage: node tools/checks/src/validate-typography.ts (from the repo root)
import {
  classStrings,
  classTokens,
  designTokens,
  type Finding,
  readGlobalsCss,
  runCheck,
  type Source,
} from "./design.ts";

const DEPRECATED = /^(text-display|text-heading(-[a-z0-9-]+)?|text-body|text-ui|text-mono)$/;
const STATE_COLOUR = /^text-(success|warning|error|info)(\/\d{1,3})?$/;
const ROLE_OVERRIDES: ReadonlyArray<[RegExp, string]> = [
  [/^typo-[a-z0-9-]+$/, "role-with-typo"],
  [/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/, "role-with-weight"],
  [/^text-(xs|sm|base|md|lg|\d?xl|\[[^\]]+\])$/, "role-with-size"],
  [/^tracking-/, "role-with-letter-spacing"],
  [/^leading-/, "role-with-line-height"],
  [/^(uppercase|lowercase|capitalize|normal-case)$/, "role-with-case"],
  [
    /^text-(foreground|secondary|tertiary|primary|accent|muted|subtle|primary-contrast|white|black)(\/\d{1,3})?$/,
    "role-with-colour",
  ],
];

/** The `role-*` classes `globals.css` defines. */
export const definedRoles = (css: string): Set<string> =>
  new Set([...designTokens(css).classes].filter((name) => name.startsWith("role-")));

function stringRules(classString: string, roles: Set<string>): Array<[string, string]> {
  const tokens = classTokens(classString);
  const broken: Array<[string, string]> = [];
  for (const { token, utility } of tokens) {
    if (DEPRECATED.test(utility)) broken.push(["deprecated-class", token]);
    else if (utility.startsWith("role-") && utility.includes("/")) broken.push(["role-with-opacity", token]);
    else if (utility.startsWith("role-") && !roles.has(utility)) broken.push(["undefined-role", token]);
  }
  if (!tokens.some(({ utility }) => utility.startsWith("role-"))) return broken;
  for (const { token, utility } of tokens) {
    if (utility.startsWith("role-") || STATE_COLOUR.test(utility)) continue;
    const override = ROLE_OVERRIDES.find(([pattern]) => pattern.test(utility));
    if (override) broken.push([override[1], token]);
  }
  return broken;
}

export function checkTypography(source: Source, roles: Set<string>): Finding[] {
  return classStrings(source.text).flatMap(({ text, line }) =>
    stringRules(text, roles).map(([rule, detail]) => ({ path: source.path, line, rule, detail })),
  );
}

if (import.meta.main) {
  const roles = definedRoles(readGlobalsCss());
  process.exit(runCheck("validate-typography", (source) => checkTypography(source, roles)));
}
