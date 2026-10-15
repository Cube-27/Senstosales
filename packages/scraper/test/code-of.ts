import { ScraperError } from "../src/port.ts";

/** The error code a call rejects with. */
export async function codeOf(call: Promise<unknown>): Promise<string> {
  const error: unknown = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof ScraperError ? error.code : `not a ScraperError: ${String(error)}`;
}
