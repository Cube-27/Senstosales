import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { apiQuery } from "../src/lib/api.ts";

afterEach(() => vi.unstubAllGlobals());

describe("apiQuery (ARCHITECTURE §12.1)", () => {
  it("keys a read by [route name, input]", () => {
    expect(apiQuery("po.detail", { params: { id: "7000123" } }).queryKey).toEqual([
      "po.detail",
      { params: { id: "7000123" } },
    ]);
    expect(apiQuery("onboarding.status").queryKey).toEqual(["onboarding.status", {}]);
  });

  it("takes read routes only", () => {
    // @ts-expect-error a write route is not a query
    expect(apiQuery("buyers.delete", { params: { id: "b1" } }).queryKey[0]).toBe("buyers.delete");
  });

  it("reads through the typed client on the page's origin", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify({ required: true })));
    });
    expect(await new QueryClient().fetchQuery(apiQuery("onboarding.status"))).toEqual({ required: true });
    expect(urls).toEqual(["/api/onboarding"]);
  });
});
