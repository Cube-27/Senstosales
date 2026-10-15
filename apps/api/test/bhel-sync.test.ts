// SPEC-19 PR 4: the BHEL login wizard and the scrape jobs over the fake scraper. The wizard adds the supplier code and
// the stored password to the captcha (INV-81) and asks again in place on a wrong captcha or OTP; a scrape job stores
// and ingests each page through the folder-import ingest, a page that cannot be fetched fails alone, cancel holds
// between documents, and the session closes when the job ends (INV-100). Real node:sqlite and the in-process runner;
// synthetic pages only (C1).
import { auditLog, po, sourceDocument, srv, supplier } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { createFakeScraper, createSessions, type FakeScript, type Scraper, type Sessions } from "@senstosales/scraper";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { createJobRunner, type JobRunner } from "../src/platform/node/job-runner.ts";
import { apiRoutes } from "../src/routes/index.ts";
import { bhelScrapeHandlers } from "../src/services/bhel-sync.ts";
import { createServices } from "../src/services/index.ts";
import { jobWorker } from "../src/services/job-worker.ts";
import { gate, ID, json, memoryLogger, testApp } from "./helpers.ts";
import { poPage } from "./po-pages.ts";
import { srvPage } from "./srv-pages.ts";
import { fixedClock, memoryStorage, supplierDb } from "./service-deps.ts";

const PASSWORD = "portal-pass-synthetic";
const CAPTCHA_PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);
const PO_1 = poPage({ number: "4500001", date: "10/04/2025", items: [{ no: 10 }] });
const PO_2 = poPage({ number: "4500002", date: "11/04/2025", items: [{ no: 10 }] });
const SRV_1 = srvPage("4500001", [{ srv: "7000001", date: "20/04/2025", item: 10 }]);

const SCRIPT: FakeScript = {
  captchaPng: CAPTCHA_PNG,
  captcha: "AB12C",
  otp: "123456",
  poPages: { "4500001": PO_1, "4500002": PO_2 },
  srvPages: { "4500001": SRV_1 },
};

let db: NodeDb;
let runner: JobRunner;
let sessions: Sessions;
let http: ReturnType<typeof testApp>;
let logins: Array<{ supplierCode: string; password: string }>;
/** Sessions the scraper opened. */
let opened: number;

/** An app over `script`; the scraper records what each login was given. */
async function setup(script: FakeScript = SCRIPT, wrap: (s: Scraper) => Scraper = (s) => s) {
  const fake = createFakeScraper(script);
  logins = [];
  opened = 0;
  const scraper = wrap({
    async openSession() {
      opened += 1;
      const session = await fake.openSession();
      return {
        ...session,
        submitCaptcha: (supplierCode, password, captcha) => {
          logins.push({ supplierCode, password });
          return session.submitCaptcha(supplierCode, password, captcha);
        },
      };
    },
  });
  sessions = createSessions(fixedClock);
  const storage = memoryStorage();
  const deps = { db, clock: fixedClock, storage, scraper, sessions };
  runner = createJobRunner(jobWorker({ ...deps, logger: memoryLogger(), handlers: bhelScrapeHandlers(deps) }));
  http = testApp(apiRoutes(createServices({ ...deps, jobs: runner, bhel: { scraper, sessions } })));
}

beforeEach(async () => {
  db = await supplierDb();
  await db.batch([db.build.update(supplier).set({ bhelSupplierCode: "TEST-001" })]);
  await setup();
  await http.send("/api/settings/bhel-password", json("PUT", { password: PASSWORD }));
});
afterEach(() => db.close());

const post = (path: string, body?: unknown) => http.send(path, json("POST", body ?? {}));

/** The base64 the wire carries for `bytes`. */
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** A session through captcha and OTP, ready to scrape. */
async function loggedIn(): Promise<string> {
  const { sessionId } = await http.client.request("bhel.start", {});
  await http.client.request("bhel.captcha", { params: { sessionId }, body: { captcha: "AB12C" } });
  await http.client.request("bhel.otp", { params: { sessionId }, body: { otp: "123456" } });
  return sessionId;
}

async function runScrape(body: {
  type: "po.scrape" | "srv.scrape";
  sessionId: string;
  poIds?: string[];
  limit?: number;
}) {
  const { id } = await http.client.request("jobs.start", { body });
  await runner.idle();
  return http.client.request("jobs.detail", { params: { id } });
}

describe("the login wizard", () => {
  test("captcha, then OTP, each asked again in place when wrong", async () => {
    const start = await http.client.request("bhel.start", {});
    expect(start).toEqual({ sessionId: expect.stringMatching(/^[0-9A-Z]{26}$/), captchaPng: b64(CAPTCHA_PNG) });
    const { sessionId } = start;
    const params = { sessionId };

    expect(await http.client.request("bhel.captcha", { params, body: { captcha: "WRONG" } })).toEqual({
      step: "captcha",
      captchaPng: b64(CAPTCHA_PNG),
      message: "The captcha was not accepted. Type the new captcha and try again.",
    });
    expect(await http.client.request("bhel.captcha", { params, body: { captcha: "AB12C" } })).toEqual({
      step: "otp",
      message: null,
    });
    expect(await http.client.request("bhel.otp", { params, body: { otp: "000000" } })).toEqual({
      step: "otp",
      message: "The OTP was not accepted. Check the e-mail and try again.",
    });
    expect(await http.client.request("bhel.otp", { params, body: { otp: "123456" } })).toEqual({ step: "ready" });
    // INV-81: the API, not the request, supplies the supplier code and the stored password.
    expect(logins).toEqual([
      { supplierCode: "TEST-001", password: PASSWORD },
      { supplierCode: "TEST-001", password: PASSWORD },
    ]);
  });

  test("the stored password is in no wizard response or log line", async () => {
    const start = await post("/api/bhel/session");
    const { sessionId } = (await start.clone().json()) as { sessionId: string };
    const responses = [
      start,
      await post(`/api/bhel/session/${sessionId}/captcha`, { captcha: "WRONG" }),
      await post(`/api/bhel/session/${sessionId}/captcha`, { captcha: "AB12C" }),
      await post(`/api/bhel/session/${sessionId}/otp`, { otp: "123456" }),
    ];
    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    for (const res of responses) expect(await res.text()).not.toContain(PASSWORD);
    expect(logins).toHaveLength(2);
    expect(JSON.stringify(http.logger.lines)).not.toContain(PASSWORD);
  });

  test("without a saved password, the wizard asks for one in Settings and opens no session", async () => {
    await http.client.request("settings.clearBhelPassword", {});
    const res = await post("/api/bhel/session");
    expect([res.status, await res.json()]).toEqual([
      409,
      { code: "bhel-password-missing", message: "Save the BHEL password in Settings first." },
    ]);
    expect(opened).toBe(0);
  });

  test("without a supplier code, the wizard asks for one", async () => {
    await db.batch([db.build.update(supplier).set({ bhelSupplierCode: null })]);
    const res = await post("/api/bhel/session");
    expect([res.status, await res.json()]).toEqual([
      409,
      { code: "bhel-supplier-code-missing", message: "Add the BHEL supplier code to the supplier details first." },
    ]);
  });

  test.each([
    [
      "edge-unavailable" as const,
      "BHEL sync needs Microsoft Edge, which could not be started. Folder import still works.",
    ],
    [
      "portal-unreachable" as const,
      "The BHEL portal could not be reached. Check the internet connection and try again.",
    ],
  ])("%s answers its plain message (EC-09)", async (failOpen, message) => {
    await setup({ ...SCRIPT, failOpen });
    const res = await post("/api/bhel/session");
    expect([res.status, await res.json()]).toEqual([409, { code: failOpen, message }]);
  });

  test("an unknown or closed session has ended", async () => {
    const ended = { code: "bhel-session-ended", message: "This BHEL login has ended. Start the sync again." };
    const unknown = await post(`/api/bhel/session/${ID}/captcha`, { captcha: "AB12C" });
    expect([unknown.status, await unknown.json()]).toEqual([404, ended]);

    const { sessionId } = await http.client.request("bhel.start", {});
    expect(await http.client.request("bhel.close", { params: { sessionId } })).toEqual({ ok: true });
    const closed = await post(`/api/bhel/session/${sessionId}/otp`, { otp: "123456" });
    expect([closed.status, await closed.json()]).toEqual([404, ended]);
  });

  test("an OTP before the captcha is refused plainly", async () => {
    const { sessionId } = await http.client.request("bhel.start", {});
    const res = await post(`/api/bhel/session/${sessionId}/otp`, { otp: "123456" });
    expect([res.status, await res.json()]).toEqual([
      409,
      { code: "out-of-order", message: "The BHEL login steps were done out of order. Start the sync again." },
    ]);
  });
});

describe("scrape jobs", () => {
  const poNumbers = async () => (await db.query(db.build.select({ n: po.poNumber }).from(po))).map((r) => r.n).sort();

  test("a PO scrape stores and ingests every listed PO once, then closes the session", async () => {
    const sessionId = await loggedIn();
    const { job, events } = await runScrape({ type: "po.scrape", sessionId });

    expect([job.status, job.progress, events]).toEqual([
      "done",
      { total: 2, done: 2, skipped: 0, failed: 0, current: null },
      [],
    ]);
    expect(await poNumbers()).toEqual(["4500001", "4500002"]);
    const stored = await db.query(
      db.build.select({ key: sourceDocument.key, jobId: sourceDocument.jobId }).from(sourceDocument),
    );
    expect(stored.sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: "4500001", jobId: job.id },
      { key: "4500002", jobId: job.id },
    ]);
    // Stored before parsing, and not a second time by the ingest (D-0178).
    const stores = await db.query(db.build.select().from(auditLog));
    expect(stores.filter((row) => row.action === "source_document.store")).toHaveLength(2);
    expect(sessions.get(sessionId)).toBeUndefined();
  });

  test("an SRV scrape ingests the SRV pages of the given PO ids", async () => {
    const sessionId = await loggedIn();
    const { job } = await runScrape({ type: "srv.scrape", sessionId, poIds: ["4500001"] });
    expect([job.status, job.progress]).toEqual(["done", { total: 1, done: 1, skipped: 0, failed: 0, current: null }]);
    const srvs = await db.query(db.build.select({ n: srv.srvNumber }).from(srv));
    expect(srvs).toEqual([{ n: "7000001" }]);
  });

  test("`limit` takes the first ids the portal lists", async () => {
    const sessionId = await loggedIn();
    const { job } = await runScrape({ type: "po.scrape", sessionId, limit: 1 });
    expect(job.progress).toEqual({ total: 1, done: 1, skipped: 0, failed: 0, current: null });
    expect(await poNumbers()).toEqual(["4500001"]);
  });

  test("a page that cannot be fetched fails as an event and the other pages still commit", async () => {
    const sessionId = await loggedIn();
    const { job, events } = await runScrape({ type: "po.scrape", sessionId, poIds: ["4500009", "4500002"] });

    expect([job.status, job.progress]).toEqual(["done", { total: 2, done: 1, skipped: 0, failed: 1, current: null }]);
    expect(events.map(({ level, documentKey, message }) => ({ level, documentKey, message }))).toEqual([
      { level: "error", documentKey: "PO 4500009", message: "A page could not be fetched from the BHEL portal." },
    ]);
    expect(await poNumbers()).toEqual(["4500002"]);
  });

  test("a page that does not parse fails alone, and its raw HTML is kept", async () => {
    await setup({ ...SCRIPT, poPages: { "4500001": "<html>not a PO</html>", "4500002": PO_2 } });
    const sessionId = await loggedIn();
    const { job } = await runScrape({ type: "po.scrape", sessionId });
    expect(job.progress).toEqual({ total: 2, done: 1, skipped: 0, failed: 1, current: null });
    const keys = await db.query(db.build.select({ key: sourceDocument.key }).from(sourceDocument));
    expect(keys.map((r) => r.key).sort()).toEqual(["4500001", "4500002"]);
  });

  test("cancel stops between documents and still closes the session", async () => {
    const { open, opened } = gate();
    await setup(SCRIPT, (scraper) => ({
      async openSession() {
        const session = await scraper.openSession();
        return { ...session, listPoIds: async () => (await opened, session.listPoIds()) };
      },
    }));
    const sessionId = await loggedIn();
    const { id } = await http.client.request("jobs.start", { body: { type: "po.scrape", sessionId } });
    await http.client.request("jobs.cancel", { params: { id } });
    open();
    await runner.idle();

    const { job } = await http.client.request("jobs.detail", { params: { id } });
    expect([job.status, job.progress.done]).toEqual(["cancelled", 0]);
    expect(await poNumbers()).toEqual([]);
    expect(sessions.get(sessionId)).toBeUndefined();
  });

  test("a job whose session has ended fails with the plain message", async () => {
    const { job } = await runScrape({ type: "po.scrape", sessionId: ID });
    expect([job.status, job.error]).toEqual(["failed", "This BHEL login has ended. Start the sync again."]);
  });

  test("a job on a session not yet logged in fails plainly", async () => {
    const { sessionId } = await http.client.request("bhel.start", {});
    const { job } = await runScrape({ type: "po.scrape", sessionId });
    expect([job.status, job.error]).toEqual([
      "failed",
      "The BHEL login steps were done out of order. Start the sync again.",
    ]);
  });
});

test("without a scraper, the wizard routes do not answer", async () => {
  const plain = testApp(apiRoutes(createServices({ db, clock: fixedClock, storage: memoryStorage(), jobs: runner })));
  expect((await plain.send("/api/bhel/session", json("POST", {}))).status).toBe(404);
});
