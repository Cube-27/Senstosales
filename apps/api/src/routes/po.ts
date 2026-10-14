// PO reads (SPEC-10 PR 1): list, stats, detail and the linked-document popovers (D-0099).
import type { Handlers } from "../app.ts";
import type { PoService } from "../services/po.ts";

export function poRoutes(po: PoService) {
  return {
    "po.list": ({ query }) => po.list(query),
    "po.stats": ({ query }) => po.stats(query),
    "po.detail": ({ params }) => po.detail(params.id),
    "po.linked": ({ params }) => po.linked(params.id),
  } satisfies Handlers;
}
