// PO reads (SPEC-10 PR 1): list, stats, detail and the linked-document popovers (D-0099); manual create, edit and
// delete (PR 2); the manual dispatched quantity (PR 3).
import type { Handlers } from "../app.ts";
import type { PoService } from "../services/po.ts";
import type { PoManualQtyService } from "../services/po-manual-qty.ts";

export function poRoutes(po: PoService) {
  return {
    "po.list": ({ query }) => po.list(query),
    "po.stats": ({ query }) => po.stats(query),
    "po.detail": ({ params }) => po.detail(params.id),
    "po.linked": ({ params }) => po.linked(params.id),
    "po.create": ({ body }) => po.create(body),
    "po.update": ({ params, body }) => po.update(params.id, body),
    "po.delete": async ({ params }) => {
      await po.delete(params.id);
      return { ok: true };
    },
  } satisfies Handlers;
}

export function poManualQtyRoutes(manualQty: PoManualQtyService) {
  return {
    "po.setManualDispatched": ({ params, body }) => manualQty.set(params.id, params.itemId, body),
  } satisfies Handlers;
}
