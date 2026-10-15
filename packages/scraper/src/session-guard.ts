// The port's step order (D-0376), written once for every Scraper: `prepareLogin` -> `submitCaptcha` -> `submitOtp` ->
// listing and fetching. A driver supplies only the portal actions; the guard refuses calls out of order or after
// `close`, starts the login over after any failure but a wrong OTP, and validates PO ids (INV-97).
import { assertPoId, isPoId, ScraperError, type ScraperSession } from "./port.ts";

export type Login = { readonly supplierCode: string; readonly password: string; readonly captcha: string };

/** Listing and fetching once logged in. */
export type PortalPages = {
  listPoIds(): Promise<string[]>;
  fetchPoHtml(poId: string): Promise<string>;
  fetchSrvHtml(poId: string): Promise<string>;
};

export type PortalDriver = {
  /** The captcha image as PNG bytes. */
  openLogin(): Promise<Uint8Array>;
  /** Where the portal went: the OTP step, or the supplier PO page when it skipped the OTP (EC-64). */
  submitLogin(login: Login): Promise<"otp" | "po-list">;
  /** Rejects `wrong-otp` when the portal asks again. */
  submitOtp(otp: string): Promise<void>;
  /** Called once on the supplier PO page. */
  loggedIn(): Promise<PortalPages>;
  close(): Promise<void>;
};

type Step =
  | { readonly kind: "start" | "captcha" | "closed" }
  /** `skipped`: the portal opened the PO page without an OTP step, so `submitOtp` only confirms it (EC-64). */
  | { readonly kind: "otp"; readonly skipped: boolean }
  | { readonly kind: "ready"; readonly pages: PortalPages };

type StepOf<K extends Step["kind"]> = Extract<Step, { kind: K }>;

export function guardedSession(driver: PortalDriver): ScraperSession {
  let step: Step = { kind: "start" };

  const isAt = <K extends Step["kind"]>(s: Step, kinds: readonly K[]): s is StepOf<K> =>
    (kinds as readonly string[]).includes(s.kind);

  /** The current step, if it is one of `kinds`. */
  function at<K extends Step["kind"]>(...kinds: K[]): StepOf<K> {
    if (step.kind === "closed") throw new ScraperError("closed");
    if (!isAt(step, kinds)) throw new ScraperError("out-of-order");
    return step;
  }

  /** Runs a login action. A failure that is not a ScraperError (a timeout, a navigation error) means the portal did not
   * answer as expected: `portal-unreachable`, its detail never passed on (INV-81, INV-106). */
  async function login<T>(action: () => Promise<T>): Promise<T> {
    let result: T;
    try {
      result = await action();
    } catch (err) {
      if (step.kind === "closed") throw new ScraperError("closed");
      const error = err instanceof ScraperError ? err : new ScraperError("portal-unreachable");
      // The portal shows a new captcha after anything but a wrong OTP, so the next try starts from `prepareLogin`.
      if (error.code !== "wrong-otp") step = { kind: "start" };
      throw error;
    }
    if (step.kind === "closed") throw new ScraperError("closed");
    return result;
  }

  return {
    async prepareLogin() {
      at("start", "captcha");
      const png = await login(() => driver.openLogin());
      step = { kind: "captcha" };
      return png;
    },
    async submitCaptcha(supplierCode, password, captcha) {
      at("captcha");
      const where = await login(() => driver.submitLogin({ supplierCode, password, captcha }));
      step = { kind: "otp", skipped: where === "po-list" };
    },
    async submitOtp(otp) {
      if (!at("otp").skipped) await login(() => driver.submitOtp(otp));
      step = { kind: "ready", pages: await login(() => driver.loggedIn()) };
    },
    async listPoIds() {
      return (await at("ready").pages.listPoIds()).filter(isPoId);
    },
    async fetchPoHtml(poId) {
      const { pages } = at("ready");
      assertPoId(poId);
      return pages.fetchPoHtml(poId);
    },
    async fetchSrvHtml(poId) {
      const { pages } = at("ready");
      assertPoId(poId);
      return pages.fetchSrvHtml(poId);
    },
    async close() {
      if (step.kind === "closed") return;
      step = { kind: "closed" };
      await driver.close();
    },
  };
}
