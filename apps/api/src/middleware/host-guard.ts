// C10, INV-79: the API answers only requests addressed to the loopback host and the port it listens on, so a page on
// another site cannot reach it through DNS rebinding. The rule is fixed: never configurable or relaxed.
import type { MiddlewareHandler } from "hono";

import { ValidationError } from "../errors.ts";

export function hostGuard(port: number): MiddlewareHandler {
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return async (c, next) => {
    if (!allowed.has(c.req.header("host") ?? "")) {
      throw new ValidationError("bad-host", "This address is not allowed.");
    }
    await next();
  };
}
