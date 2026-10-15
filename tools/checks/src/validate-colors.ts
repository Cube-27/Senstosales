// INV-66, C7 (SPEC-14 §2): colours in the web app come from the `globals.css` tokens. Rebuilt from the legacy
// validate-colors rules (palette utilities, hex and rgb/hsl literals), plus the C7 bans the legacy check did not
// cover: `dark:` colour fixes, important utilities, and colour utilities or `var(--…)` values naming no token.
// Usage: node tools/checks/src/validate-colors.ts (from the repo root)
import {
  type ClassToken,
  classStrings,
  classTokens,
  designTokens,
  type Finding,
  lineAt,
  readGlobalsCss,
  runCheck,
  type Source,
} from "./design.ts";

type Tokens = ReturnType<typeof designTokens>;

const COLOUR_UTILITY =
  /^-?(text|bg|border(?:-[xytblrse])?|ring|ring-offset|outline|divide(?:-[xy])?|fill|stroke|from|via|to|decoration|accent|caret|placeholder)-(.+)$/;
const PALETTE =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$/;
const KEYWORD_COLOUR = /^(white|black|transparent|current|inherit)$/;
// Values these prefixes take that are not colours: sizes, widths, sides, styles, alignment, gradients, images.
const NOT_A_COLOUR =
  /^(\d+(\.\d+)?%?|px|auto|none|hidden|[xytblrse]|[xytblrse]-\d+|\d?xs|sm|base|md|lg|\d?xl|left|center|right|justify|start|end|top|bottom|wrap|nowrap|balance|pretty|ellipsis|clip|solid|dashed|dotted|double|collapse|separate|inset|offset-\d+|spacing-.+|shadow.*|reverse|underline|overline|line-through|no-underline|wavy|from-font|cover|contain|fixed|local|scroll|clip-.+|origin-.+|no-repeat|repeat.*|gradient-to-.+|linear-.+|radial.*|conic.*|blend-.+)$/;
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/i;
const WHOLE_LITERAL_COLOUR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(.*\))$/i;
const STRING = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

/** The rule a class token breaks, or null. */
function classRule({ token, variants, utility, important }: ClassToken, tokens: Tokens): string | null {
  if (important) return "important";
  if (LITERAL_COLOUR.test(utility)) return "literal-colour";
  const names = Array.from(utility.matchAll(/var\((--[\w-]+)/g), (m) => m[1] ?? "");
  if (names.some((name) => !tokens.properties.has(name))) return "undefined-token";
  // The colour a colour utility names, without its `/opacity`; none for sizes, sides and styles.
  const value = COLOUR_UTILITY.exec(utility)?.[2]?.replace(/\/[\w.[\]]+$/, "");
  if (value === undefined || NOT_A_COLOUR.test(value)) return null;
  if (variants.includes("dark")) return "dark-colour";
  return value.startsWith("[") ? null : namedColourRule(value, token, tokens);
}

function namedColourRule(value: string, token: string, tokens: Tokens): string | null {
  if (PALETTE.test(value)) return "palette-colour";
  const defined = KEYWORD_COLOUR.test(value) || tokens.colours.has(value) || tokens.classes.has(token);
  return defined ? null : "undefined-colour";
}

export function checkColors(source: Source, tokens: Tokens): Finding[] {
  const findings: Finding[] = [];
  for (const { text, line } of classStrings(source.text)) {
    for (const token of classTokens(text)) {
      const rule = classRule(token, tokens);
      if (rule) findings.push({ path: source.path, line, rule, detail: token.token });
    }
  }
  // Colours written outside class names: inline styles, props, constants.
  for (const m of source.text.matchAll(STRING)) {
    const value = m[1] ?? m[2] ?? "";
    if (WHOLE_LITERAL_COLOUR.test(value)) {
      findings.push({ path: source.path, line: lineAt(source.text, m.index), rule: "literal-colour", detail: value });
    }
  }
  return findings;
}

if (import.meta.main) {
  const tokens = designTokens(readGlobalsCss());
  process.exit(runCheck("validate-colors", (source) => checkColors(source, tokens)));
}
