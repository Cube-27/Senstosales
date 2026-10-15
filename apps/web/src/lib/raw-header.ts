// A BHEL page's header cells, kept as label -> text (SPEC-06 §4.2), read back by label.

/** A label as printed, compared without case, dots, colons or repeated spaces: `R.C. NO:` is `RC NO`. */
export const normalLabel = (label: string): string =>
  label.toUpperCase().replaceAll(/[.:]/g, "").replaceAll(/\s+/g, " ").trim();

/** The text under the first of `labels` the header has, or `""` when it has none. */
export function rawLookup(raw: Readonly<Record<string, string>>, labels: readonly string[]): string {
  const wanted = new Set(labels.map(normalLabel));
  return (
    Object.entries(raw)
      .find(([label]) => wanted.has(normalLabel(label)))?.[1]
      .trim() ?? ""
  );
}
