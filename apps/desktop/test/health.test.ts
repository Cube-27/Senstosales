// SPEC-20 PR 2, ADR 0001: the health wait. A `no-cors` request resolves once the server answers at all; refused
// connections are retried until the attempts run out.
import { describe, expect, it } from "vite-plus/test";

import { waitForHealth } from "../src/health.ts";

/** A fetch that refuses `refusals` times, then answers; it records each call. */
function fakeFetch(refusals: number) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    if (calls.length <= refusals) throw new TypeError("Failed to fetch");
    return {};
  };
  return { fetch, calls };
}

describe("waitForHealth", () => {
  it("asks /api/health with no-cors until the server answers", async () => {
    const { fetch, calls } = fakeFetch(2);
    const slept: number[] = [];
    const ok = await waitForHealth({
      base: "http://127.0.0.1:51234",
      fetch,
      sleep: async (ms) => void slept.push(ms),
      attempts: 5,
      intervalMs: 50,
    });
    expect(ok).toBe(true);
    expect(calls).toEqual(Array(3).fill(["http://127.0.0.1:51234/api/health", { mode: "no-cors" }]));
    expect(slept).toEqual([50, 50]);
  });

  it("gives up after the last attempt", async () => {
    const { fetch, calls } = fakeFetch(10);
    const ok = await waitForHealth({
      base: "http://127.0.0.1:1",
      fetch,
      sleep: async () => {},
      attempts: 4,
      intervalMs: 5,
    });
    expect(ok).toBe(false);
    expect(calls).toHaveLength(4);
  });
});
