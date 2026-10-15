import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/public-sans";
import "./styles/globals.css";

import { createApp } from "./app.ts";
import { applyTheme, storedTheme } from "./lib/theme.ts";
import { followJobInTray } from "./lib/tray.ts";
import { getPlatform, inTauri } from "./platform/index.ts";

applyTheme(storedTheme());

const { queryClient, router } = createApp();

// A browser has no tray, so only the shell polls for it.
if (inTauri())
  void getPlatform().then((platform) => followJobInTray(queryClient, (text) => platform.setTrayStatus(text)));

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
