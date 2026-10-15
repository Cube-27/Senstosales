/** An item's material as the legacy tables show it: the code, then the description truncated beside it. */
export function MaterialCell({
  code,
  description,
}: {
  readonly code: string | null;
  readonly description: string | null | undefined;
}) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 role-material-code">{code ?? "—"}</span>
      <span className="truncate role-material-description">{description ?? ""}</span>
    </span>
  );
}

/** The material's full text, for the cell's tooltip. */
export const materialTitle = (...parts: readonly (string | null | undefined)[]): string =>
  parts.filter(Boolean).join(" · ");
