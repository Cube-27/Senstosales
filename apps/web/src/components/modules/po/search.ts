// `/po`'s URL search (SPEC-14 §2): the list query's paging, sort and status, and the filters as the URL holds them.
import { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { zRangeSearch, zUrlFlag } from "../../../lib/search.ts";

export const zPoSearch = routes["po.list"].query
  .pick({ page: true, pageSize: true, sort: true, dir: true, status: true })
  .extend({ ...zRangeSearch, gemc: zUrlFlag });

export type PoSearch = z.output<typeof zPoSearch>;
