// How a form shows a refused write (SPEC-15 §4.2): the server's message at the field its `details` names, or in the
// form footer; a 409 version conflict also offers "Reload".
import { ApiError } from "@senstosales/schemas/errors";
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

export interface ServerErrors {
  /** Message per form field path (`currentPassword`, `supplier.name`), from `details.fields`. */
  readonly fields: Readonly<Record<string, string>>;
  /** The server's message, or a plain one for a network failure: the footer shows it when no field took it. */
  readonly message: string;
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
  if (!(error instanceof ApiError)) return { fields: {}, message: NETWORK, conflict: false };
  const fields = Object.fromEntries(fieldIssues(error.body.details));
  return { fields, message: error.body.message, conflict: error.status === 409 };
}

/** Puts a refused write's messages on the form: each at the field `fieldFor` maps its server path to, else the
 * server's message at the form's `root` (the footer). */
export function showServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  fieldFor: Readonly<Record<string, FieldPath<T>>>,
): ServerErrors {
  const errors = serverErrors(error);
  let placed = false;
  for (const [path, message] of Object.entries(errors.fields)) {
    const field = fieldFor[path];
    if (field === undefined) continue;
    setError(field, { message });
    placed = true;
  }
  if (!placed) setError("root", { message: errors.message });
  return errors;
}
