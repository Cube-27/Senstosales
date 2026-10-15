import { Loading } from "../../lib/icons.ts";

export interface QueryStateProps {
  /** The failed read; loading while there is none. */
  readonly error: Error | null;
}

/** A detail page before its data: loading, or the read's error, in one footprint. */
export function QueryState({ error }: QueryStateProps) {
  return (
    <div className="flex min-h-96 items-center justify-center">
      {error ? (
        <p role="alert" className="role-empty-text text-error">
          {error.message}
        </p>
      ) : (
        <span role="status" className="inline-flex items-center gap-2 role-empty-text">
          <Loading className="size-4 animate-spin" aria-hidden />
          Loading...
        </span>
      )}
    </div>
  );
}
