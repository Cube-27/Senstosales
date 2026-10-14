// INV-102: every mutation is JSON. A form or plain-text POST from another page is refused before any handler runs.
import type { MiddlewareHandler } from "hono";

import { UnsupportedMediaTypeError } from "../errors.ts";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export const jsonOnly: MiddlewareHandler = async (c, next) => {
  const mediaType = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!READS.has(c.req.method) && mediaType !== "application/json") {
    throw new UnsupportedMediaTypeError("json-only", "The request must be sent as JSON.");
  }
  await next();
};
