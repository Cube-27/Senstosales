// `/deviations`' URL search (SPEC-14 §2): paging, the PO-number search, Show resolved, and the type and PO a link from
// another screen narrows the list to.
import { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { zUrlFlag, zUrlText } from "../../../lib/search.ts";

export const zDeviationsSearch = routes["flags.list"].query
  .pick({ page: true, pageSize: true, dir: true, type: true, poId: true })
  .extend({ q: zUrlText, resolved: zUrlFlag });

export type DeviationsSearch = z.output<typeof zDeviationsSearch>;
