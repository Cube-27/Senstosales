// A first run: the API starts on an empty data folder.
import { expect, test } from "./fixtures.ts";

test.use({ dataset: "fresh" });

test("asks for onboarding", async ({ request }) => {
  expect(await (await request.get("/api/onboarding")).json()).toEqual({ required: true });
});
