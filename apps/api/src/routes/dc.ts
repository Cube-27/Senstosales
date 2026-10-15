// Delivery challans (SPEC-11): the create form's dispatchable items and create (PR 1).
import type { Handlers } from "../app.ts";
import type { DcService } from "../services/dc.ts";

export function dcRoutes(dc: DcService) {
  return {
    "dc.dispatchable": ({ params }) => dc.dispatchable(params.poId),
    "dc.create": ({ body }) => dc.create(body),
  } satisfies Handlers;
}
