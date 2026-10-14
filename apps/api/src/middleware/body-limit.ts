// INV-110: a body over the cap is refused before it is parsed, by its Content-Length or, when streamed, as soon as
// the bytes read pass the cap.
import { bodyLimit as honoBodyLimit } from "hono/body-limit";

import { PayloadTooLargeError } from "../errors.ts";

/** 10 MB: the per-file cap on uploaded BHEL HTML (ARCHITECTURE §9). */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

export const bodyLimit = honoBodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new PayloadTooLargeError("too-large", "The upload is too large. The limit is 10 MB.");
  },
});
