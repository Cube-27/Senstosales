// SPEC-19 PR 4: the node runtime offers BHEL sync only with a scraper, and closes its sessions at app exit (INV-100).
// Synthetic values only (C1).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GST_DEFAULTS } from "@senstosales/db";
import { createFakeScraper, type Scraper } from "@senstosales/scraper";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { openRuntime, type Runtime } from "../../src/platform/node/runtime.ts";

const PROFILE = {
  name: "Example Supplier",
  gstin: null,
  address: null,
  state: null,
  stateCode: null,
  contact: null,
  email: null,
  bhelSupplierCode: "TEST-001",
  bankDetails: {},
  invoiceDefaults: {},
  ...GST_DEFAULTS,
};
const quiet = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

let dataDir: string;
let runtime: Runtime | undefined;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "senstosales-runtime-"));
});
afterEach(async () => {
  runtime?.db.close();
  runtime = undefined;
  await rm(dataDir, { recursive: true, force: true });
});

/** A fake scraper that counts its closed sessions. */
function countingScraper() {
  const fake = createFakeScraper({ captchaPng: Uint8Array.of(1), captcha: "C", otp: "1", poPages: {}, srvPages: {} });
  const counts = { closed: 0 };
  const scraper: Scraper = {
    async openSession() {
      const session = await fake.openSession();
      return { ...session, close: async () => void (counts.closed += 1) };
    },
  };
  return { scraper, counts };
}

test("without a scraper, BHEL sync is not offered", async () => {
  runtime = await openRuntime({ dataDir, logger: quiet });
  expect(runtime.services.bhel).toBeUndefined();
  await runtime.closeSessions();
});

test("with a scraper, the wizard opens sessions and app exit closes every one", async () => {
  const { scraper, counts } = countingScraper();
  runtime = await openRuntime({ dataDir, logger: quiet, scraper });
  const { services } = runtime;
  await services.onboarding.complete(PROFILE);
  await services.secrets.set("bhel-password", "portal-pass-synthetic");

  await services.bhel!.start();
  await services.bhel!.start();
  await runtime.closeSessions();

  expect(counts.closed).toBe(2);
});
