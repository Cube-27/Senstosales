import type { Result } from "../src/index.ts";

/** Builds a test input from its literal string; a parse failure fails the test. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
