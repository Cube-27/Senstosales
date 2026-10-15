import { createFileRoute } from "@tanstack/react-router";

import { SettingsScreen } from "../components/modules/settings/SettingsScreen.tsx";

export const Route = createFileRoute("/settings")({ component: SettingsScreen });
