/** A code as legacy titled it on screen: `ord_qty` -> `Ord Qty`, `flag.acknowledge` -> `Flag Acknowledge`. */
export const titleCase = (code: string): string =>
  code.replaceAll(/[._]/g, " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
