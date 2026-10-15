import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";

import { createAppRouter } from "../src/router.ts";

const router = createAppRouter(new QueryClient());

/** The route that answers `path`: the deepest match, as the router renders it. */
const resolve = (path: string): string | undefined => router.matchRoutes(path).at(-1)?.routeId;

describe("route tree (INV-67)", () => {
  it("registers every frozen route plus /onboarding, and nothing else", () => {
    expect(Object.keys(router.routesByPath).toSorted()).toEqual([
      "/",
      "/auth/login",
      "/dc",
      "/dc/$id",
      "/dc/create",
      "/delivery-tracker",
      "/deviations",
      "/invoice",
      "/invoice/$id",
      "/invoice/create",
      "/onboarding",
      "/po",
      "/po/$id",
      "/po/create",
      "/po/ingest-bhel",
      "/reports",
      "/settings",
      "/srv",
      "/srv/$id",
      "/system/ledger",
    ]);
  });

  it.each([
    ["/", "/"],
    ["/po", "/po/"],
    ["/po/7000123", "/po/$id"],
    ["/po/create", "/po/create"],
    ["/po/ingest-bhel", "/po/ingest-bhel"],
    ["/dc/01J0000000000000000000000A", "/dc/$id"],
    ["/dc/create", "/dc/create"],
    ["/system/ledger", "/system/ledger"],
  ])("%s resolves to %s", (path, routeId) => {
    expect(resolve(path)).toBe(routeId);
  });

  it("/procurement is not a route (A-16)", () => {
    expect(resolve("/procurement")).toBe("__root__");
  });
});
