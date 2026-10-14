// An app with every SPEC-07 route over a freshly migrated in-memory DB with no supplier, as on first run. Every
// request is signed in; the onboarding gate is real. Every response body is kept, so a test can assert what never
// left the API (INV-81). Synthetic values only (C1).
import { auditLog } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { GstPct } from "@senstosales/domain";
import { createClient } from "@senstosales/schemas";

import { apiRoutes } from "../src/routes/index.ts";
import { createServices } from "../src/services/index.ts";
import { migratedDb } from "./db.ts";
import { fixedClock } from "./service-deps.ts";
import { testApp } from "./helpers.ts";

export const SUPPLIER_WIRE = {
  name: "Example Supplier",
  gstin: "TESTGSTIN0001",
  address: "1 Example Road",
  state: "Example State",
  stateCode: "99",
  contact: "Example Contact",
  email: "accounts@example.com",
  bhelSupplierCode: "TEST-001",
  bankDetails: { bank: "Example Bank" },
  invoiceDefaults: { terms: "Net 30" },
};

export const ONBOARDING_WIRE = { ...SUPPLIER_WIRE, cgstPct: "6", sgstPct: "6" };
export const ONBOARDING_BODY = { ...SUPPLIER_WIRE, cgstPct: 600000 as GstPct, sgstPct: 600000 as GstPct };

const open: NodeDb[] = [];

/** A new app; `closeApiApps` closes every database opened since the last call. */
export async function apiApp(): Promise<ReturnType<typeof build>> {
  const db = await migratedDb();
  open.push(db);
  return build(db);
}

export function closeApiApps(): void {
  for (const db of open.splice(0)) db.close();
}

/** An app that has completed onboarding. */
export async function onboardedApp(): Promise<ReturnType<typeof build>> {
  const app = await apiApp();
  await app.client.request("onboarding.complete", { body: ONBOARDING_BODY });
  return app;
}

function build(db: NodeDb) {
  const services = createServices({ db, clock: fixedClock, jobs: { enqueue: () => {}, holds: () => false } });
  const t = testApp(apiRoutes(services), () => Promise.resolve(true), services.onboarding.done);
  const bodies: string[] = [];
  const send = async (path: string, init?: RequestInit) => {
    const res = await t.send(path, init);
    bodies.push(await res.clone().text());
    return res;
  };
  const audit = () => db.query(db.build.select().from(auditLog).orderBy(auditLog.id));
  return { db, services, send, client: createClient(send), bodies, logger: t.logger, audit };
}
