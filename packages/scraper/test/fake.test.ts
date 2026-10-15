import { describe, expect, it } from "vite-plus/test";

import { createFakeScraper, type FakeScript } from "../src/fake.ts";
import { ScraperError, type ScraperSession } from "../src/port.ts";

const CAPTCHA_PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);

function script(overrides: Partial<FakeScript> = {}): FakeScript {
  return {
    captchaPng: CAPTCHA_PNG,
    captcha: "AB12C",
    otp: "123456",
    poPages: { "4500000001": "<html>PO 1</html>", "4500000002": "<html>PO 2</html>" },
    srvPages: { "4500000001": "<html>SRV 1</html>" },
    ...overrides,
  };
}

async function loggedIn(overrides: Partial<FakeScript> = {}): Promise<ScraperSession> {
  const session = await createFakeScraper(script(overrides)).openSession();
  await session.prepareLogin();
  await session.submitCaptcha("SUP001", "secret-pass", "AB12C");
  await session.submitOtp("123456");
  return session;
}

/** The error code a call rejects with. */
async function codeOf(call: Promise<unknown>): Promise<string> {
  const error: unknown = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof ScraperError ? error.code : `not a ScraperError: ${String(error)}`;
}

describe("fake scraper: the full flow", () => {
  it("serves the captcha, takes captcha and OTP, then lists and fetches pages as strings", async () => {
    const session = await createFakeScraper(script()).openSession();
    expect(await session.prepareLogin()).toEqual(CAPTCHA_PNG);
    await session.submitCaptcha("SUP001", "secret-pass", "AB12C");
    await session.submitOtp("123456");
    expect(await session.listPoIds()).toEqual(["4500000001", "4500000002"]);
    expect(await session.fetchPoHtml("4500000002")).toBe("<html>PO 2</html>");
    expect(await session.fetchSrvHtml("4500000001")).toBe("<html>SRV 1</html>");
  });

  it("lists the scripted ids when they differ from the pages on hand", async () => {
    const session = await loggedIn({ poIds: ["4500000002", "4500000009"] });
    expect(await session.listPoIds()).toEqual(["4500000002", "4500000009"]);
  });
});

describe("fake scraper: wrong input is asked again", () => {
  it("a wrong captcha needs a fresh captcha before the next try", async () => {
    const session = await createFakeScraper(script()).openSession();
    await session.prepareLogin();
    expect(await codeOf(session.submitCaptcha("SUP001", "secret-pass", "WRONG"))).toBe("wrong-captcha");
    expect(await codeOf(session.submitCaptcha("SUP001", "secret-pass", "AB12C"))).toBe("out-of-order");
    await session.prepareLogin();
    await session.submitCaptcha("SUP001", "secret-pass", "AB12C");
    await session.submitOtp("123456");
    expect(await session.listPoIds()).toEqual(["4500000001", "4500000002"]);
  });

  it("a wrong OTP can be retried in place", async () => {
    const session = await createFakeScraper(script()).openSession();
    await session.prepareLogin();
    await session.submitCaptcha("SUP001", "secret-pass", "AB12C");
    expect(await codeOf(session.submitOtp("000000"))).toBe("wrong-otp");
    await session.submitOtp("123456");
    expect(await session.listPoIds()).toEqual(["4500000001", "4500000002"]);
  });
});

describe("fake scraper: steps run in order", () => {
  it.each([
    ["captcha before prepareLogin", (s: ScraperSession) => s.submitCaptcha("SUP001", "p", "AB12C")],
    ["OTP before captcha", (s: ScraperSession) => s.submitOtp("123456")],
    ["listing before login", (s: ScraperSession) => s.listPoIds()],
    ["fetching before login", (s: ScraperSession) => s.fetchPoHtml("4500000001")],
  ])("%s is out-of-order", async (_name, call) => {
    const session = await createFakeScraper(script()).openSession();
    expect(await codeOf(call(session))).toBe("out-of-order");
  });

  it("a closed session refuses every step", async () => {
    const session = await loggedIn();
    await session.close();
    await session.close();
    expect(await codeOf(session.listPoIds())).toBe("closed");
    expect(await codeOf(session.prepareLogin())).toBe("closed");
  });
});

describe("fake scraper: ids and fetch failures", () => {
  it.each(["", "45000000011", "4500-01", "../srv", " 4500000001", "4500000001\n", "١٢٣"])(
    "rejects PO id %j before any fetch",
    async (id) => {
      const session = await loggedIn();
      expect(await codeOf(session.fetchPoHtml(id))).toBe("invalid-po-id");
      expect(await codeOf(session.fetchSrvHtml(id))).toBe("invalid-po-id");
    },
  );

  it("accepts ids of 1 to 10 digits", async () => {
    const session = await loggedIn({ poPages: { "7": "<p>7</p>", "9999999999": "<p>9</p>" } });
    expect(await session.fetchPoHtml("7")).toBe("<p>7</p>");
    expect(await session.fetchPoHtml("9999999999")).toBe("<p>9</p>");
  });

  it("a page the portal does not serve fails that fetch only", async () => {
    const session = await loggedIn();
    expect(await codeOf(session.fetchSrvHtml("4500000002"))).toBe("fetch-failed");
    expect(await session.fetchPoHtml("4500000002")).toBe("<html>PO 2</html>");
  });

  it("drops listed ids that are not valid PO ids", async () => {
    const session = await loggedIn({ poIds: ["4500000001", "javascript:alert(1)", "12345678901"] });
    expect(await session.listPoIds()).toEqual(["4500000001"]);
  });
});

describe("fake scraper: the portal or browser is unavailable", () => {
  it("reports Edge missing at openSession with the EC-09 message", async () => {
    const error = await createFakeScraper(script({ failOpen: "edge-unavailable" }))
      .openSession()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScraperError);
    expect(error).toMatchObject({
      code: "edge-unavailable",
      message: "BHEL sync needs Microsoft Edge, which could not be started. Folder import still works.",
    });
  });

  it("reports an unreachable portal at openSession", async () => {
    const error = await createFakeScraper(script({ failOpen: "portal-unreachable" }))
      .openSession()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "portal-unreachable",
      message: "The BHEL portal could not be reached. Check the internet connection and try again.",
    });
  });
});

describe("fake scraper: errors carry no secrets", () => {
  it("no error message holds the password, OTP or a page body", async () => {
    const session = await createFakeScraper(script()).openSession();
    await session.prepareLogin();
    const messages: string[] = [];
    const record = (e: unknown) => messages.push(e instanceof Error ? e.message : String(e));
    await session.submitCaptcha("SUP001", "secret-pass", "WRONG").catch(record);
    await session.prepareLogin();
    await session.submitCaptcha("SUP001", "secret-pass", "AB12C");
    await session.submitOtp("654321").catch(record);
    await session.submitOtp("123456");
    await session.fetchSrvHtml("4500000002").catch(record);
    expect(messages).toHaveLength(3);
    for (const message of messages) {
      expect(message).not.toMatch(/secret-pass|654321|WRONG|<html>/);
    }
  });
});
