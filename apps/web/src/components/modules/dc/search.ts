// `/dc`'s URL search (SPEC-14 §2): the list query's paging and sort, and the filters as the URL holds them.
import { routes, zId } from "@senstosales/schemas";
import { z } from "zod";

import { zRangeSearch } from "../../../lib/search.ts";

export const zDcSearch = routes["dc.list"].query
  .pick({ page: true, pageSize: true, sort: true, dir: true })
  .extend(zRangeSearch);

export type DcSearch = z.output<typeof zDcSearch>;

/** `/dc/create?po=` opens the form on that PO's dispatchable items (the PO list's and page's Create DC). */
export const zDcCreateSearch = z.object({ po: zId.optional().catch(undefined) });
