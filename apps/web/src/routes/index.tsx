import { createFileRoute } from "@tanstack/react-router";

import { DashboardScreen } from "../components/modules/dashboard/DashboardScreen.tsx";

export const Route = createFileRoute("/")({ component: DashboardScreen });
