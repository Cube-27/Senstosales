// `/srv`'s URL search (SPEC-14 §2): one search for both views; `view=po` is the by-PO view. A sort applies only to
// the view whose list has that column.
import { routes } from "@senstosales/schemas";
import { z } from "zod";

import { zRangeSearch } from "../../../lib/search.ts";

const zSrvSort = routes["srv.list"].query.shape.sort.unwrap();
const zPoSort = routes["srv.byPo"].query.shape.sort.unwrap();
const SRV_SORTS = zSrvSort.options;
const PO_SORTS = zPoSort.options;

export const zSrvSearch = routes["srv.list"].query.pick({ page: true, pageSize: true, dir: true }).extend({
  sort: z.union([zSrvSort, zPoSort]).optional(),
  ...zRangeSearch,
  view: z.literal("po").optional(),
});

export type SrvSearch = z.output<typeof zSrvSearch>;

type SrvSort = (typeof SRV_SORTS)[number];
type PoSort = (typeof PO_SORTS)[number];

const isIn = <T extends string>(options: readonly T[], value: string | undefined): value is T =>
  options.some((o) => o === value);

/** The search's sort for the SRV list, or none when it names a by-PO column. */
export const srvSort = (sort: string | undefined): SrvSort | undefined => (isIn(SRV_SORTS, sort) ? sort : undefined);

/** The search's sort for the by-PO list, or none when it names an SRV column. */
export const poSort = (sort: string | undefined): PoSort | undefined => (isIn(PO_SORTS, sort) ? sort : undefined);
