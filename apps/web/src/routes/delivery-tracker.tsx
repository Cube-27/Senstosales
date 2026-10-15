import { createFileRoute } from "@tanstack/react-router";

import { DeliveryTracker } from "../components/modules/delivery-tracker/DeliveryTracker.tsx";
import { zTrackerSearch } from "../components/modules/delivery-tracker/search.ts";

export const Route = createFileRoute("/delivery-tracker")({
  validateSearch: zTrackerSearch,
  component: DeliveryTracker,
});
