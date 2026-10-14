// Settings and the BHEL password. The password routes answer only whether one is saved, never its value (INV-81).
import type { Handlers } from "../app.ts";
import type { Services } from "../services/index.ts";

type SettingsRoute =
  | "settings.get"
  | "settings.update"
  | "settings.bhelPassword"
  | "settings.setBhelPassword"
  | "settings.clearBhelPassword";

export function settingsRoutes({
  settings,
  secrets,
}: Pick<Services, "settings" | "secrets">): Required<Pick<Handlers, SettingsRoute>> {
  return {
    "settings.get": () => settings.get(),
    "settings.update": ({ body }) => settings.update(body),
    "settings.bhelPassword": async () => ({ saved: (await secrets.get("bhel-password")) !== null }),
    "settings.setBhelPassword": async ({ body }) => {
      await secrets.set("bhel-password", body.password);
      return { saved: true };
    },
    "settings.clearBhelPassword": async () => {
      await secrets.set("bhel-password", null);
      return { saved: false };
    },
  };
}
