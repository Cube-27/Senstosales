import { describe, expect, it } from "vite-plus/test";

import { createFakeScraper } from "../src/fake.ts";
import type { Scraper, ScraperSession } from "../src/port.ts";
import { createSessions, IDLE_LIMIT_MS } from "../src/sessions.ts";

/** A clock the test moves by hand. */
function manualClock(start = "2025-06-01T05:30:00.000Z") {
  let at = Date.parse(start);
  return {
    now: () => new Date(at).toISOString(),
    advance: (ms: number) => {
      at += ms;
    },
  };
}

/** A fake scraper that counts how many of its sessions were closed. */
function countingScraper(): { scraper: Scraper; closed: () => number } {
  const fake = createFakeScraper({ captchaPng: Uint8Array.of(1), captcha: "C", otp: "1", poPages: {}, srvPages: {} });
  let closed = 0;
  const scraper: Scraper = {
    async openSession(): Promise<ScraperSession> {
      const session = await fake.openSession();
      return {
        ...session,
        close: async () => {
          closed += 1;
          await session.close();
        },
      };
    },
  };
  return { scraper, closed: () => closed };
}

const MINUTE = 60_000;

describe("sessions", () => {
  it("the idle limit is 15 minutes", () => {
    expect(IDLE_LIMIT_MS).toBe(15 * MINUTE);
  });

  it("returns the session opened for an id, and none for an unknown id", async () => {
    const { scraper } = countingScraper();
    const sessions = createSessions(manualClock());
    const session = await sessions.open("job-1", scraper);
    expect(sessions.get("job-1")).toBe(session);
    expect(sessions.get("job-2")).toBeUndefined();
  });

  it("closes a session at job end and forgets it", async () => {
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(manualClock());
    await sessions.open("job-1", scraper);
    await sessions.close("job-1");
    await sessions.close("job-1");
    expect(closed()).toBe(1);
    expect(sessions.get("job-1")).toBeUndefined();
  });

  it("closes every session at app exit", async () => {
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(manualClock());
    await sessions.open("job-1", scraper);
    await sessions.open("job-2", scraper);
    await sessions.closeAll();
    expect(closed()).toBe(2);
    expect(sessions.get("job-1")).toBeUndefined();
    expect(sessions.get("job-2")).toBeUndefined();
  });

  it("closes the earlier session when an id is opened again", async () => {
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(manualClock());
    await sessions.open("job-1", scraper);
    const second = await sessions.open("job-1", scraper);
    expect(closed()).toBe(1);
    expect(sessions.get("job-1")).toBe(second);
  });

  it("a session closed by its holder leaves the map", async () => {
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(manualClock());
    const session = await sessions.open("job-1", scraper);
    await session.close();
    expect(closed()).toBe(1);
    expect(sessions.get("job-1")).toBeUndefined();
  });
});

describe("sessions: idle close", () => {
  it("closes a session unused for 15 minutes, not one unused for a millisecond less", async () => {
    const clock = manualClock();
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(clock);
    await sessions.open("job-1", scraper);
    clock.advance(15 * MINUTE - 1);
    await sessions.closeIdle();
    expect(closed()).toBe(0);
    clock.advance(1);
    await sessions.closeIdle();
    expect(closed()).toBe(1);
    expect(sessions.get("job-1")).toBeUndefined();
  });

  it("every call on the session counts as use, so a long-running job is not closed", async () => {
    const clock = manualClock();
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(clock);
    const session = await sessions.open("job-1", scraper);
    clock.advance(10 * MINUTE);
    await session.prepareLogin();
    clock.advance(10 * MINUTE);
    await sessions.closeIdle();
    expect(closed()).toBe(0);
    clock.advance(5 * MINUTE);
    await sessions.closeIdle();
    expect(closed()).toBe(1);
  });

  it("a failing call still counts as use", async () => {
    const clock = manualClock();
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(clock);
    const session = await sessions.open("job-1", scraper);
    clock.advance(10 * MINUTE);
    await session.listPoIds().catch(() => undefined);
    clock.advance(10 * MINUTE);
    await sessions.closeIdle();
    expect(closed()).toBe(0);
  });

  it("get returns none for an idle-expired session before any sweep, and the sweep closes it", async () => {
    const clock = manualClock();
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(clock);
    await sessions.open("job-1", scraper);
    clock.advance(15 * MINUTE);
    expect(sessions.get("job-1")).toBeUndefined();
    await sessions.closeIdle();
    expect(closed()).toBe(1);
  });

  it("a session whose close rejects still leaves the map, and the sweep resolves", async () => {
    const clock = manualClock();
    const { scraper } = countingScraper();
    const failing: Scraper = {
      async openSession() {
        const session = await scraper.openSession();
        return { ...session, close: () => Promise.reject(new Error("browser already gone")) };
      },
    };
    const sessions = createSessions(clock);
    await sessions.open("job-1", failing);
    clock.advance(15 * MINUTE);
    await expect(sessions.closeIdle()).resolves.toBeUndefined();
    expect(sessions.get("job-1")).toBeUndefined();
  });

  it("only the idle sessions close", async () => {
    const clock = manualClock();
    const { scraper, closed } = countingScraper();
    const sessions = createSessions(clock);
    await sessions.open("old", scraper);
    clock.advance(10 * MINUTE);
    const fresh = await sessions.open("fresh", scraper);
    clock.advance(5 * MINUTE);
    await sessions.closeIdle();
    expect(closed()).toBe(1);
    expect(sessions.get("old")).toBeUndefined();
    expect(sessions.get("fresh")).toBe(fresh);
  });
});
