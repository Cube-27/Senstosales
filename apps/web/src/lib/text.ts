/** A code as legacy titled it on screen: `ord_qty` -> `Ord Qty`, `flag.acknowledge` -> `Flag Acknowledge`. */
export const titleCase = (code: string): string =>
  code.replaceAll(/[._]/g, " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());

/** A typed text field as stored: trimmed, and `null` when blank. */
export const blankToNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());
