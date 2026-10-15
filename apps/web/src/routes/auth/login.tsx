// The login page (SPEC-15 PR 1). `redirect` is the page to return to; the gate keeps it inside the app. A plain
// validator, not Zod, keeps Zod out of the shell bundle (INV-104).
import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "../../components/modules/auth/LoginScreen.tsx";

export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  component: LoginScreen,
});
