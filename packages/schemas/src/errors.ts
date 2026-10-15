// The client's error, apart from the client: the web shell checks `instanceof ApiError` on every failed query, and
// this module keeps zod and the route table out of the shell bundle (INV-104).
import type { ErrorBody } from "./api/common.ts";

/** A non-2xx answer, with the API's error body (`{ code, message, details? }`). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
    this.name = "ApiError";
  }
}
