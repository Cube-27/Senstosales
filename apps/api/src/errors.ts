// The one error hierarchy (ARCHITECTURE §4): services and middleware throw these, and `onError` turns each into its
// status and the body `{ code, message, details? }`. `code` is stable for the UI; `message` is plain language for the
// user (C11); `details` never carries a secret or a document body (INV-81, INV-106).
import type { Issue } from "@senstosales/domain";
import type { ErrorBody } from "@senstosales/schemas";

type Details = NonNullable<ErrorBody["details"]>;

export abstract class AppError extends Error {
  abstract readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500;
  readonly code: string;
  readonly details: Details | undefined;

  constructor(code: string, message: string, details?: Details) {
    super(message);
    this.name = new.target.name;
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
  readonly status = 400;
}

export class AuthError extends AppError {
  readonly status = 401;
}

export class ForbiddenError extends AppError {
  readonly status = 403;
}

export class NotFoundError extends AppError {
  readonly status = 404;
}

export class ConflictError extends AppError {
  readonly status = 409;
}

/** A body over the cap (INV-110). */
export class PayloadTooLargeError extends AppError {
  readonly status = 413;
}

/** A mutation that is not JSON (INV-102). */
export class UnsupportedMediaTypeError extends AppError {
  readonly status = 415;
}

/** An operation that failed part way, whose message tells the user what was kept and where (SPEC-21 restore). */
export class OperationFailedError extends AppError {
  readonly status = 500;
}

/** A 400 naming the field, so a form can show the message there. */
export const fieldError = (code: string, field: string, message: string): ValidationError =>
  new ValidationError(code, message, { fields: [{ path: `body.${field}`, message }] });

/**
 * The 400 for invalid document lines: the first issue's code, and every issue at its body path, so a form can show
 * each message on its line (SPEC-11 §4.3, D-0250). `bodyPath` maps a domain path to the body's field names.
 */
export function linesError(issues: readonly Issue[], bodyPath = (path: string) => path): ValidationError {
  const fields = issues.map((issue) => ({ path: `body.${bodyPath(issue.path)}`, message: issue.message }));
  return new ValidationError(issues[0]!.code, issues[0]!.message, { fields });
}

export const poNotFound = (): NotFoundError => new NotFoundError("po-not-found", "This PO was not found.");

export const dcNotFound = (): NotFoundError => new NotFoundError("dc-not-found", "This DC was not found.");

export const invoiceNotFound = (): NotFoundError =>
  new NotFoundError("invoice-not-found", "This invoice was not found.");

/** INV-28: a DC has one invoice. */
export const dcHasInvoice = (dcNumber: string): ConflictError =>
  new ConflictError("dc-has-invoice", `DC ${dcNumber} already has an invoice.`);

/** An edit that sent a version someone else has since changed (INV-95, D-0124). */
export const staleVersion = (): ConflictError =>
  new ConflictError("stale-version", "Someone else changed this. Reload it and try again.");

/** No supplier yet (INV-78): the web app reads this as "open /onboarding". */
export const onboardingRequired = (): ConflictError =>
  new ConflictError("onboarding-required", "Set up the supplier details first.");
