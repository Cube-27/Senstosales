import { describe, expect, it } from "vite-plus/test";

import { classStrings, designTokens } from "../src/design.ts";
import { checkColors } from "../src/validate-colors.ts";
import { checkComponents } from "../src/validate-components.ts";
import { checkIcons } from "../src/validate-icons.ts";
import { checkImports, registryNames } from "../src/validate-imports.ts";
import { checkTypography, definedRoles } from "../src/validate-typography.ts";

const CSS = `@theme {
  --color-surface: var(--surface);
  --color-error: var(--error);
  --color-subtle: var(--text-tertiary);
  --color-placeholder: var(--text-placeholder);
}

:root {
  --surface: #ffffff;
  --text-placeholder: #68645e;
}

@layer utilities {
  .role-page-title {
    color: var(--text-primary);
  }
  .role-table-cell {
    color: var(--text-primary);
  }
}
`;
const tokens = designTokens(CSS);
const roles = definedRoles(CSS);
const at = (path: string, text: string) => ({ path, text });
const rules = (findings: Array<{ line: number; rule: string; detail: string }>) =>
  findings.map(({ line, rule, detail }) => [line, rule, detail]);

describe("class strings", () => {
  it("reads className attributes, expressions and class-helper arguments, not other strings", () => {
    const text = [
      `const label = "bg-red-500 is not a class here";`,
      `<div className="p-2 bg-surface" />`,
      `<div className={cn("flex", active && "text-error", \`m-\${n} border-border\`)} />`,
      `const button = cva("rounded-md", { variants: { tone: { error: "bg-error" } } });`,
    ].join("\n");
    expect(classStrings(text)).toEqual([
      { text: "p-2 bg-surface", line: 2 },
      { text: "flex", line: 3 },
      { text: "text-error", line: 3 },
      { text: "m-  border-border", line: 3 },
      { text: "rounded-md", line: 4 },
      { text: "bg-error", line: 4 },
    ]);
  });

  it("reads the tokens and theme colours of globals.css", () => {
    expect([...tokens.colours]).toEqual(["surface", "error", "subtle", "placeholder"]);
    expect(tokens.properties.has("--text-placeholder")).toBe(true);
    expect([...roles]).toEqual(["role-page-title", "role-table-cell"]);
  });
});

describe("validate-colors", () => {
  it("fails palette, literal, dark:, important and undefined colours", () => {
    const text = [
      `<p className="text-red-600 bg-[#fafafa] dark:bg-surface border-destructive bg-surface!" />`,
      `<p className="text-[var(--nope)] placeholder:text-placeholder" />`,
      `const style = { color: "#0057b3", background: "rgb(0 0 0)" };`,
    ].join("\n");
    expect(rules(checkColors(at("apps/web/src/x.tsx", text), tokens))).toEqual([
      [1, "palette-colour", "text-red-600"],
      [1, "literal-colour", "bg-[#fafafa]"],
      [1, "dark-colour", "dark:bg-surface"],
      [1, "undefined-colour", "border-destructive"],
      [1, "important", "bg-surface!"],
      [2, "undefined-token", "text-[var(--nope)]"],
      [3, "literal-colour", "#0057b3"],
      [3, "literal-colour", "rgb(0 0 0)"],
    ]);
  });

  it("passes token colours and the non-colour uses of colour prefixes", () => {
    const text = `<p className="bg-surface text-error/80 hover:bg-surface text-white border-2 border-x border-b border-t-2 text-sm/6 text-left ring-2 outline-none text-[13px] bg-[var(--surface)] divide-y bg-linear-to-r" />`;
    expect(checkColors(at("apps/web/src/x.tsx", text), tokens)).toEqual([]);
  });
});

describe("validate-typography", () => {
  it("fails role overrides, deprecated classes, role opacity and undefined roles", () => {
    const text = [
      `<h1 className="role-page-title font-bold uppercase text-subtle tracking-wide" />`,
      `<p className="text-heading-lg" />`,
      `<p className="role-table-cell/50 role-kpi-xxl" />`,
    ].join("\n");
    expect(rules(checkTypography(at("apps/web/src/x.tsx", text), roles))).toEqual([
      [1, "role-with-weight", "font-bold"],
      [1, "role-with-case", "uppercase"],
      [1, "role-with-colour", "text-subtle"],
      [1, "role-with-letter-spacing", "tracking-wide"],
      [2, "deprecated-class", "text-heading-lg"],
      [3, "role-with-opacity", "role-table-cell/50"],
      [3, "undefined-role", "role-kpi-xxl"],
    ]);
  });

  it("passes a role with state colour and layout classes, and weights without a role", () => {
    const text = `<td className="role-table-cell text-error truncate px-3" /><b className="font-bold text-sm" />`;
    expect(checkTypography(at("apps/web/src/x.tsx", text), roles)).toEqual([]);
  });
});

describe("validate-imports", () => {
  const registry = registryNames(
    `export { Button, type ButtonProps } from "./Button.tsx";\nexport { Toast as Toaster } from "./Toast.tsx";\n`,
  );

  it("reads the registry's export names", () => {
    expect([...registry]).toEqual(["Button", "ButtonProps", "Toaster"]);
  });

  it("fails deep imports, primitives outside the registry and local copies", () => {
    const text = [
      `import { Button } from "../components/common/Button.tsx";`,
      `import { Dialog } from "../components/ui/dialog.tsx";`,
      `export function Button() {}`,
    ].join("\n");
    expect(rules(checkImports(at("apps/web/src/routes/po.tsx", text), registry))).toEqual([
      [1, "deep-import", "../components/common/Button.tsx"],
      [2, "primitive-outside-registry", "../components/ui/dialog.tsx"],
      [3, "local-copy", "Button"],
    ]);
  });

  it("passes the registry index, and lets common and ui import their own files", () => {
    const route = `import { Button } from "../components/common/index.ts";\nimport { x } from "../components/common";`;
    const common = `import { Dialog } from "../ui/dialog.tsx";\nimport { Toast } from "./Toast.tsx";\nexport function Button() {}`;
    const ui = `import { cn } from "./utils.ts";\nimport { Label } from "./label.tsx";`;
    expect(checkImports(at("apps/web/src/routes/po.tsx", route), registry)).toEqual([]);
    expect(checkImports(at("apps/web/src/components/common/Button.tsx", common), registry)).toEqual([]);
    expect(checkImports(at("apps/web/src/components/ui/dialog.tsx", ui), registry)).toEqual([]);
  });
});

describe("validate-icons", () => {
  it("fails lucide-react imported anywhere but src/lib/icons.ts", () => {
    const text = `import { X } from "lucide-react";\nimport { Y } from "lucide-react/icons/y";`;
    expect(rules(checkIcons(at("apps/web/src/components/common/A.tsx", text)))).toEqual([
      [1, "icon-outside-registry", "import icons from src/lib/icons.ts"],
      [2, "icon-outside-registry", "import icons from src/lib/icons.ts"],
    ]);
  });

  it("passes the icon module and imports from it", () => {
    expect(checkIcons(at("apps/web/src/lib/icons.ts", `export { X } from "lucide-react";`))).toEqual([]);
    expect(checkIcons(at("apps/web/src/routes/a.tsx", `import { X } from "../lib/icons.ts";`))).toEqual([]);
  });
});

describe("validate-components", () => {
  it("fails raw buttons and inputs on screens", () => {
    const text = `<button onClick={go}>Go</button>\n<input value={v} />\n<button role="switch" aria-checked />`;
    expect(rules(checkComponents(at("apps/web/src/routes/po.tsx", text)))).toEqual([
      [1, "raw-button", "<button onClick={go}>"],
      [2, "raw-input", "<input value={v} />"],
    ]);
  });

  it("passes the shared components, which build on the raw elements", () => {
    const text = `<button type="button" /><input />`;
    expect(checkComponents(at("apps/web/src/components/common/Button.tsx", text))).toEqual([]);
    expect(checkComponents(at("apps/web/src/components/ui/input.tsx", text))).toEqual([]);
  });
});
