// How a form shows a refused write (SPEC-15 §4.2): the server's message at the field its `details` names, or in the
// form footer; a 409 version conflict also offers "Reload".
import { ApiError } from "@senstosales/schemas/errors";

export interface ServerErrors {
  /** Message per form field path (`currentPassword`, `supplier.name`), from `details.fields`. */
  readonly fields: Readonly<Record<string, string>>;
  /** The server's message, or a plain one for a network failure: the footer shows it when no field took it. */
  readonly message: string;
  /** True when the message belongs in the footer: no field took it. */
  readonly inFooter: boolean;
  readonly conflict: boolean;
}

const NETWORK = "Could not reach the app. Try again.";

/** Field issues as the API sends them: `{ fields: [{ path: "body.<field>", message }] }`. */
function fieldIssues(details: Record<string, unknown> | undefined): Array<[string, string]> {
  const fields = details?.["fields"];
  if (!Array.isArray(fields)) return [];
  return fields.flatMap((issue: unknown): Array<[string, string]> => {
    if (typeof issue !== "object" || issue === null || !("path" in issue) || !("message" in issue)) return [];
    const { path, message } = issue;
    return typeof path === "string" && typeof message === "string" ? [[path.replace(/^body\./, ""), message]] : [];
  });
}

export function serverErrors(error: unknown): ServerErrors {
  if (!(error instanceof ApiError)) return { fields: {}, message: NETWORK, inFooter: true, conflict: false };
  const fields = Object.fromEntries(fieldIssues(error.body.details));
  return {
    fields,
    message: error.body.message,
    inFooter: Object.keys(fields).length === 0,
    conflict: error.status === 409,
  };
}
