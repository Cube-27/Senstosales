import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createQueryClient } from "./lib/query.ts";
import { createAppRouter } from "./router.ts";

const queryClient = createQueryClient((to) => void router.navigate({ to }));
const router = createAppRouter(queryClient);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
