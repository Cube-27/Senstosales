// `/system/ledger`'s URL search (SPEC-14 §2): paging, sort, the search text and the module (entity type).
import { routes } from "@senstosales/schemas";
import { z } from "zod";

import { zUrlText } from "../../../lib/search.ts";

export const zLedgerSearch = routes["audit.list"].query
  .pick({ page: true, pageSize: true, sort: true, dir: true })
  .extend({ q: zUrlText, entityType: z.string().optional() });

export type LedgerSearch = z.output<typeof zLedgerSearch>;
