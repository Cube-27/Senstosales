// After login, listing and fetching run over plain HTTP with the browser's cookies (ARCHITECTURE §7.5). Every URL is
// a constant under the portal origin and a PO id enters only the form body, after validation (INV-97). Redirects are
// refused, so no URL from the portal is ever followed (C17). Pages are returned as strings, decoded as UTF-8 like the
// parsers do (D-0536).
import { ScraperError } from "../../port.ts";
import type { PortalPages } from "../../session-guard.ts";
import { USER_AGENT } from "./launch.ts";
import { PO_DETAIL_URL, PO_LIST_URL, PORTAL_ORIGIN, readPoIds, SRV_LIST_URL } from "./selectors.ts";

const FETCH_TIMEOUT_MS = 90_000;

export type PortalCookie = { readonly name: string; readonly value: string };

/** PO ids reach it validated by the session guard (INV-97). */
export function createHttpSession(cookies: readonly PortalCookie[], fetchFn: typeof fetch = fetch): PortalPages {
  const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");

  /** GET `url`, or POST the PO id as the form field `pono` when one is given. */
  async function request(url: string, referer: string, poId?: string): Promise<string> {
    const form = poId === undefined ? null : new URLSearchParams({ pono: poId }).toString();
    const headers = {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
      Referer: referer,
      ...(form !== null && { Origin: PORTAL_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" }),
    };
    try {
      const response = await fetchFn(url, {
        method: form === null ? "GET" : "POST",
        headers,
        body: form,
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return await response.text();
    } catch {
      // A network error, timeout or redirect: reported below without its detail (INV-106).
    }
    throw new ScraperError("fetch-failed");
  }

  const fetchPo = (poId: string) => request(PO_DETAIL_URL, PO_LIST_URL, poId);

  return {
    async listPoIds() {
      return readPoIds(await request(PO_LIST_URL, PO_LIST_URL));
    },
    fetchPoHtml: fetchPo,
    async fetchSrvHtml(poId) {
      // The portal serves a PO's SRV list only after that PO's page was opened in the same session.
      await fetchPo(poId);
      return request(SRV_LIST_URL, PO_DETAIL_URL, poId);
    },
  };
}
