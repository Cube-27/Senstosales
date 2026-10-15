// Open scraper sessions, keyed by the id the login wizard hands out and the scrape job carries (INV-100). A session
// closes at job end (`close`), app exit (`closeAll`) or after 15 minutes unused (`closeIdle`, which the API runs on a
// timer). Every call on a session counts as use, so a long scrape is never closed under a running job.
import type { Scraper, ScraperSession } from "./port.ts";

export const IDLE_LIMIT_MS = 15 * 60_000;

/** The part of the `Clock` port the idle timer reads. */
export type InstantClock = { now(): string };

export type Sessions = {
  /** Opens a session under `id`, closing any earlier one under the same id. */
  open(id: string, scraper: Scraper): Promise<ScraperSession>;
  /** The open session under `id`; none once it has been idle for the limit. */
  get(id: string): ScraperSession | undefined;
  close(id: string): Promise<void>;
  closeAll(): Promise<void>;
  closeIdle(): Promise<void>;
};

type Entry = { session: ScraperSession; lastUsedMs: number };

export function createSessions(clock: InstantClock): Sessions {
  const entries = new Map<string, Entry>();
  const nowMs = () => Date.parse(clock.now());
  const isIdle = (entry: Entry) => nowMs() - entry.lastUsedMs >= IDLE_LIMIT_MS;

  async function close(id: string): Promise<void> {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    await entry.session.close();
  }

  /** Wraps `inner` so each call marks it used and its own `close` also leaves the map. */
  function tracked(id: string, inner: ScraperSession): ScraperSession {
    const entry: Entry = { session: inner, lastUsedMs: nowMs() };
    const use =
      <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A): Promise<R> => {
        entry.lastUsedMs = nowMs();
        return call(...args);
      };
    const session: ScraperSession = {
      prepareLogin: use(() => inner.prepareLogin()),
      submitCaptcha: use((code: string, password: string, captcha: string) =>
        inner.submitCaptcha(code, password, captcha),
      ),
      submitOtp: use((otp: string) => inner.submitOtp(otp)),
      listPoIds: use(() => inner.listPoIds()),
      fetchPoHtml: use((poId: string) => inner.fetchPoHtml(poId)),
      fetchSrvHtml: use((poId: string) => inner.fetchSrvHtml(poId)),
      close: async () => {
        if (entries.get(id) === entry) entries.delete(id);
        await inner.close();
      },
    };
    entry.session = session;
    entries.set(id, entry);
    return session;
  }

  return {
    async open(id, scraper) {
      await close(id);
      return tracked(id, await scraper.openSession());
    },
    get(id) {
      const entry = entries.get(id);
      return entry && !isIdle(entry) ? entry.session : undefined;
    },
    close,
    async closeAll() {
      await Promise.all([...entries.keys()].map(close));
    },
    async closeIdle() {
      const idle = [...entries].filter(([, entry]) => isIdle(entry)).map(([id]) => id);
      await Promise.all(idle.map(close));
    },
  };
}
