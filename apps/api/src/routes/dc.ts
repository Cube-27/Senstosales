// Delivery challans (SPEC-11): list, stats, the create form's dispatchable items, detail, create, header edit and
// delete. Downloads are SPEC-12; the list CSV SPEC-13.
import type { Handlers } from "../app.ts";
import type { DcService } from "../services/dc.ts";

export function dcRoutes(dc: DcService) {
  return {
    "dc.list": ({ query }) => dc.list(query),
    "dc.stats": ({ query }) => dc.stats(query),
    "dc.numberCheck": ({ query }) => dc.numberCheck(query),
    "dc.dispatchable": ({ params }) => dc.dispatchable(params.poId),
    "dc.detail": ({ params }) => dc.detail(params.id),
    "dc.create": ({ body }) => dc.create(body),
    "dc.update": ({ params, body }) => dc.update(params.id, body),
    "dc.delete": ({ params }) => dc.delete(params.id),
  } satisfies Handlers;
}
