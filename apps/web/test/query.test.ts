import { ApiError } from "@senstosales/schemas";
import { describe, expect, it } from "vite-plus/test";

import { type AuthRedirect, createQueryClient } from "../src/lib/query.ts";

const apiError = (status: number, code: string) => new ApiError(status, { code, message: "x" });

/** Fails one query and one mutation with `error`; returns the redirects the client asked for, in order. */
async function redirectsAfter(error: Error): Promise<AuthRedirect[]> {
  const seen: AuthRedirect[] = [];
  const client = createQueryClient((to) => seen.push(to));
  await client
    .fetchQuery({ queryKey: ["po-list", {}], queryFn: () => Promise.reject(error), retryDelay: 0 })
    .catch(() => {});
  await client
    .getMutationCache()
    .build(client, { mutationFn: () => Promise.reject(error) })
    .execute(undefined)
    .catch(() => {});
  return seen;
}

describe("query client (SPEC-14 §4.3)", () => {
  it("a 401 sends the user to /auth/login", async () => {
    expect(await redirectsAfter(apiError(401, "unauthenticated"))).toEqual(["/auth/login", "/auth/login"]);
  });

  it("onboarding-required sends the user to /onboarding", async () => {
    expect(await redirectsAfter(apiError(409, "onboarding-required"))).toEqual(["/onboarding", "/onboarding"]);
  });

  it.each([
    ["another API error", apiError(409, "number-taken")],
    ["a network failure", new TypeError("Failed to fetch")],
  ])("%s stays on the screen", async (_, error) => {
    expect(await redirectsAfter(error)).toEqual([]);
  });

  it.each([
    ["a refused read is not retried", apiError(404, "not-found"), 1],
    ["a network failure is tried 3 more times", new TypeError("Failed to fetch"), 4],
  ])("%s", async (_, error, expected) => {
    const client = createQueryClient(() => {});
    let calls = 0;
    const queryFn = () => {
      calls += 1;
      return Promise.reject(error);
    };
    await client.fetchQuery({ queryKey: ["po", {}], queryFn, retryDelay: 0 }).catch(() => {});
    expect(calls).toBe(expected);
  });

  it("keeps the previous page's data while the next page loads", () => {
    const client = createQueryClient(() => {});
    const placeholder = client.getDefaultOptions().queries?.placeholderData as (previous: unknown) => unknown;
    expect(placeholder({ items: ["page 1"], total: 1 })).toEqual({ items: ["page 1"], total: 1 });
  });
});
