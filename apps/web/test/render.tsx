import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

// jsdom has no scrolling; the router restores scroll positions on navigation.
window.scrollTo = () => {};

/** Renders `ui` as the page at `path` under a router, so links and the current location work. */
export function renderAt(ui: ReactNode, path = "/"): RenderResult & { router: AnyRouter } {
  const root = createRootRoute({ component: () => ui });
  const any = createRoute({ getParentRoute: () => root, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([any]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}
