// Surrogate ids are ULIDs generated in the service (C4).
import { zId } from "@senstosales/schemas";
import { describe, expect, test } from "vite-plus/test";

import { newId } from "../src/ids.ts";

describe("newId", () => {
  test.each([
    [0, "0000000000"],
    // The ULID specification's own example timestamp.
    [1469918176385, "01ARYZ6S41"],
    [2 ** 48 - 1, "7ZZZZZZZZZ"],
  ])("encodes %d ms as %s", (ms, prefix) => {
    expect(newId(ms).slice(0, 10)).toBe(prefix);
  });

  test("is a 26-character ULID the API accepts, and two ids differ", () => {
    const [a, b] = [newId(), newId()];
    expect(a).toHaveLength(26);
    expect(zId.safeParse(a).success).toBe(true);
    expect(a).not.toBe(b);
  });
});

test("ids made in one millisecond sort in the order they were made", () => {
  const ids = Array.from({ length: 2000 }, () => newId(1469918176385));
  expect([...ids].sort()).toEqual(ids);
  expect(new Set(ids).size).toBe(2000);
});
