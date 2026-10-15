// Delivery tracker list and stats (SPEC-10 PR 6) and its export (SPEC-13 PR 5).
import type { Handlers } from "../app.ts";
import type { DeliveryTrackerService } from "../services/delivery-tracker.ts";

export function deliveryTrackerRoutes(tracker: DeliveryTrackerService) {
  return {
    "deliveryTracker.list": ({ query }) => tracker.list(query),
    "deliveryTracker.stats": ({ query }) => tracker.stats(query),
    "deliveryTracker.export": ({ query }) => tracker.export(query),
  } satisfies Handlers;
}
