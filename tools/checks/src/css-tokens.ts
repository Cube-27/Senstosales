// Reads custom-property tokens out of `globals.css` (INV-66): the token-parity test and the design validators share
// it. The file is plain CSS from one author, so a block is found by its selector at the start of a line and ends at
// the first line that is a lone `}`.

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|color-mix\()/i;

/** The `--name: value` declarations of the block whose selector line is `selector {`. */
export function blockTokens(css: string, selector: string): Map<string, string> {
  const lines = css.split(/\r?\n/);
  const start = lines.indexOf(`${selector} {`);
  if (start === -1) return new Map();
  const end = lines.indexOf("}", start);
  const tokens = new Map<string, string>();
  for (const line of lines.slice(start + 1, end)) {
    const m = /^\s*(--[\w-]+)\s*:\s*(.+);\s*$/.exec(line);
    if (m) tokens.set(m[1] as string, m[2] as string);
  }
  return tokens;
}

/** The tokens of one block whose value is a colour literal (`var()` aliases follow their target). */
export function colourTokens(css: string, selector: string): Map<string, string> {
  return new Map([...blockTokens(css, selector)].filter(([, value]) => COLOUR.test(value)));
}
