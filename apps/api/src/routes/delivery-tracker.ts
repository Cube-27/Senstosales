// Delivery tracker list and stats (SPEC-10 PR 6); the export is SPEC-13's.
import type { Handlers } from "../app.ts";
import type { DeliveryTrackerService } from "../services/delivery-tracker.ts";

export function deliveryTrackerRoutes(tracker: DeliveryTrackerService) {
  return {
    "deliveryTracker.list": ({ query }) => tracker.list(query),
    "deliveryTracker.stats": ({ query }) => tracker.stats(query),
  } satisfies Handlers;
}
