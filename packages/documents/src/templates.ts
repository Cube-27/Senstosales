// The de-branded DC, invoice and GC templates (SPEC-12 §4.1), embedded at build time so loading them needs no
// filesystem (C12). Supplier identity cells hold `{supplier.<field>}` placeholders for the builders to fill.
import { TEMPLATES_BASE64 } from "./templates.generated.ts";

export type TemplateName = keyof typeof TEMPLATES_BASE64;

const decoded = new Map<TemplateName, Uint8Array<ArrayBuffer>>();

/** A fresh copy of the template's xlsx bytes, decoded once per template. */
export function templateBytes(name: TemplateName): Uint8Array<ArrayBuffer> {
  let bytes = decoded.get(name);
  if (!bytes) {
    bytes = Uint8Array.from(atob(TEMPLATES_BASE64[name]), (char) => char.codePointAt(0) ?? 0);
    decoded.set(name, bytes);
  }
  return bytes.slice();
}
