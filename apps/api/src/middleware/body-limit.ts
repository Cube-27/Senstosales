// INV-110: a body over the cap is refused before it is parsed, by its Content-Length or, when streamed, as soon as
// the bytes read pass the cap. The web client splits uploads to fit it (`splitUpload`, D-0131).
import { MAX_BODY_BYTES } from "@senstosales/schemas";
import { bodyLimit as honoBodyLimit } from "hono/body-limit";

import { PayloadTooLargeError } from "../errors.ts";

export const bodyLimit = honoBodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new PayloadTooLargeError("too-large", "The upload is too large. The limit is 10 MB.");
  },
});
