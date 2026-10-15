// `/dc`'s URL search (SPEC-14 §2): the list query's paging and sort, and the filters as the URL holds them.
import { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { zRangeSearch } from "../../../lib/search.ts";

export const zDcSearch = routes["dc.list"].query
  .pick({ page: true, pageSize: true, sort: true, dir: true })
  .extend(zRangeSearch);

export type DcSearch = z.output<typeof zDcSearch>;
