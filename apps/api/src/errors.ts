// The one error hierarchy (ARCHITECTURE §4): services and middleware throw these, and `onError` turns each into its
// status and the body `{ code, message, details? }`. `code` is stable for the UI; `message` is plain language for the
// user (C11); `details` never carries a secret or a document body (INV-81, INV-106).
import type { ErrorBody } from "@senstosales/schemas";

type Details = NonNullable<ErrorBody["details"]>;

export abstract class AppError extends Error {
  abstract readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415;
  readonly code: string;
  readonly details: Details | undefined;

  constructor(code: string, message: string, details?: Details) {
    super(message);
    this.code = code;
    this.details = details;
  }

  toBody(): ErrorBody {
    const body: ErrorBody = { code: this.code, message: this.message };
    if (this.details) body.details = this.details;
    return body;
  }
}

export class ValidationError extends AppError {
  override name = "ValidationError";
  readonly status = 400;
}

export class AuthError extends AppError {
  override name = "AuthError";
  readonly status = 401;
}

export class ForbiddenError extends AppError {
  override name = "ForbiddenError";
  readonly status = 403;
}

export class NotFoundError extends AppError {
  override name = "NotFoundError";
  readonly status = 404;
}

export class ConflictError extends AppError {
  override name = "ConflictError";
  readonly status = 409;
}

/** A body over the cap (INV-110). */
export class PayloadTooLargeError extends AppError {
  override name = "PayloadTooLargeError";
  readonly status = 413;
}

/** A mutation that is not JSON (INV-102). */
export class UnsupportedMediaTypeError extends AppError {
  override name = "UnsupportedMediaTypeError";
  readonly status = 415;
}
