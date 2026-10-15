import { describe, expect, it } from "vite-plus/test";

import type { PortalDriver, PortalPages } from "../src/session-guard.ts";
import { guardedSession } from "../src/session-guard.ts";
import { codeOf } from "./code-of.ts";

const PAGES: PortalPages = {
  listPoIds: () => Promise.resolve(["4500000001", "45-1", "12345678901", "4500000002"]),
  fetchPoHtml: (poId) => Promise.resolve(`<html>PO ${poId}</html>`),
  fetchSrvHtml: (poId) => Promise.resolve(`<html>SRV ${poId}</html>`),
};

/** A driver that logs each action and answers as `overrides` say, else as a portal that accepts everything. */
function driver(overrides: Partial<PortalDriver> = {}): { driver: PortalDriver; calls: string[] } {
  const calls: string[] = [];
  const log =
    <A extends unknown[], R>(name: string, f: (...args: A) => Promise<R>) =>
    (...args: A) => {
      calls.push(name);
      return f(...args);
    };
  const base: PortalDriver = {
    openLogin: () => Promise.resolve(Uint8Array.of(1)),
    submitLogin: () => Promise.resolve("otp" as const),
    submitOtp: () => Promise.resolve(),
    loggedIn: () => Promise.resolve(PAGES),
    close: () => Promise.resolve(),
    ...overrides,
  };
  return {
    calls,
    driver: {
      openLogin: log("openLogin", base.openLogin),
      submitLogin: log("submitLogin", base.submitLogin),
      submitOtp: log("submitOtp", base.submitOtp),
      loggedIn: log("loggedIn", base.loggedIn),
      close: log("close", base.close),
    },
  };
}

describe("session guard", () => {
  it("turns a driver failure into portal-unreachable without its detail, and starts the login over", async () => {
    let fail = true;
    const { driver: d } = driver({
      submitLogin: async () => {
        if (fail) throw new Error("Timeout 60000ms exceeded; cookie=secret-value");
        return "otp";
      },
    });
    const session = guardedSession(d);
    await session.prepareLogin();
    const error: unknown = await session.submitCaptcha("SUP001", "secret-pass", "4821").catch((e: unknown) => e);
    expect(String(error)).toBe(
      "ScraperError: The BHEL portal could not be reached. Check the internet connection and try again.",
    );
    fail = false;
    expect(await codeOf(session.submitCaptcha("SUP001", "secret-pass", "4821"))).toBe("out-of-order");
    await session.prepareLogin();
    await session.submitCaptcha("SUP001", "secret-pass", "4821");
  });

  it("when the portal skipped the OTP step, submitOtp only confirms the login (EC-64)", async () => {
    const { driver: d, calls } = driver({ submitLogin: () => Promise.resolve("po-list" as const) });
    const session = guardedSession(d);
    await session.prepareLogin();
    await session.submitCaptcha("SUP001", "secret-pass", "4821");
    await session.submitOtp("anything");
    expect(calls).toEqual(["openLogin", "submitLogin", "loggedIn"]);
    expect(await session.fetchPoHtml("4500000001")).toBe("<html>PO 4500000001</html>");
  });

  it("drops listed ids that are not 1 to 10 digits (INV-97)", async () => {
    const session = guardedSession(driver().driver);
    await session.prepareLogin();
    await session.submitCaptcha("SUP001", "secret-pass", "4821");
    await session.submitOtp("123456");
    expect(await session.listPoIds()).toEqual(["4500000001", "4500000002"]);
  });

  it("a step that settles after close answers closed and does not reopen the session", async () => {
    let release: (png: Uint8Array) => void = () => {};
    const { driver: d, calls } = driver({
      openLogin: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const session = guardedSession(d);
    const pending = session.prepareLogin();
    await session.close();
    release(Uint8Array.of(1));
    expect(await codeOf(pending)).toBe("closed");
    expect(await codeOf(session.prepareLogin())).toBe("closed");
    expect(calls).toEqual(["openLogin", "close"]);
  });
});
