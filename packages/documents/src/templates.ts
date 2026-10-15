// The de-branded DC, invoice and GC templates (SPEC-12 §4.1), embedded at build time so loading them needs no
// filesystem (C12). Supplier identity cells hold `{supplier.<field>}` placeholders for the builders to fill.
import { TEMPLATES_BASE64 } from "./templates.generated.ts";

export type TemplateName = keyof typeof TEMPLATES_BASE64;

/** A fresh copy of the template's xlsx bytes. */
export function templateBytes(name: TemplateName): Uint8Array {
  return Uint8Array.from(atob(TEMPLATES_BASE64[name]), (char) => char.codePointAt(0) ?? 0);
}
