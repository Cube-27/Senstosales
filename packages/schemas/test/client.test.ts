import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { FetchLike, FetchResponse } from "../src/index.ts";
import { ApiError, createClient, zGstPct, zQty } from "../src/index.ts";

const ID = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";
const ITEM = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B4";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

/** A fetch that records each call and answers with `status` and `body` (JSON) or `bytes` (a download). */
function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const res: FetchResponse = {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => (typeof body === "string" ? JSON.parse(body) : body),
      arrayBuffer: async () => new Uint8Array(body as number[]).buffer,
    };
    return res;
  };
  return { client: createClient(fetchImpl), calls };
}

const settingsWire = { cgstPct: "9", sgstPct: "2.5", preferences: { currency: "INR" } };
const four = z.decode(zQty, "4");
const settings = {
  cgstPct: z.decode(zGstPct, "9"),
  sgstPct: z.decode(zGstPct, "2.5"),
  preferences: { currency: "INR" },
};

describe("createClient: requests built from the route table", () => {
  it("sends a GET with its query string and no body, and decodes the response", async () => {
    const { client, calls } = fakeFetch(200, { open: 3, openByType: openByType(3) });
    const stats = await client.request("flags.stats");
    expect(stats).toEqual({ open: 3, openByType: openByType(3) });
    expect(calls).toEqual([
      { url: "/api/flags/stats", method: "GET", headers: { accept: "application/json" }, body: undefined },
    ]);
  });

  it("puts the query in the URL, skipping unset keys and repeating array values", async () => {
    const { client, calls } = fakeFetch(200, []);
    await client.request("search.query", { query: { q: "a b&c", types: ["po", "dc"], from: undefined } });
    expect(calls[0]?.url).toBe("/api/search?q=a%20b%26c&types=po&types=dc");
  });

  it("fills and encodes path params", async () => {
    const { client, calls } = fakeFetch(200, poItemWire);
    await client.request("po.setManualDispatched", { params: { id: ID, itemId: ITEM }, body: { qty: four } });
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(`/api/po/${ID}/items/${ITEM}/manual-dispatched`);
    expect(calls[0]?.body).toBe('{"qty":"4"}');
  });

  it("encodes the body through the codecs: percentages go as decimal strings (C3)", async () => {
    const { client, calls } = fakeFetch(200, settingsWire);
    const saved = await client.request("settings.update", { body: settings });
    expect(calls[0]).toEqual({
      url: "/api/settings",
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(settingsWire),
    });
    expect(saved).toEqual({ cgstPct: 900000, sgstPct: 250000, preferences: { currency: "INR" } });
  });

  it("decodes a manual quantity of 4 into milli-units", async () => {
    const { client } = fakeFetch(200, poItemWire);
    const item = await client.request("po.setManualDispatched", {
      params: { id: ID, itemId: ITEM },
      body: { qty: four, note: "sent by hand" },
    });
    expect(item.manualDispatchedQty).toBe(4000);
    expect(item.ordQty).toBe(10000);
  });

  it("sends an empty JSON object on a write with no body (INV-102)", async () => {
    const { client, calls } = fakeFetch(200, { ok: true });
    expect(await client.request("auth.logout")).toEqual({ ok: true });
    expect(calls[0]).toEqual({
      url: "/api/auth/logout",
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    });
  });

  it("rejects a response that does not match the schema", async () => {
    const { client } = fakeFetch(200, { ...settingsWire, cgstPct: 9 });
    await expect(client.request("settings.get")).rejects.toThrow(/expected string/i);
  });

  it("returns a download's bytes and its file name", async () => {
    const { client } = fakeFetch(200, [80, 75, 3, 4], {
      "content-disposition": 'attachment; filename="DC_12.xlsx"',
    });
    const file = await client.request("dc.excel", { params: { id: ID } });
    expect(file).toEqual({ fileName: "DC_12.xlsx", bytes: new Uint8Array([80, 75, 3, 4]) });
  });
});

describe("createClient: errors", () => {
  it("throws ApiError with the API's error body", async () => {
    const body = { code: "delete-blocked", message: "This DC has an invoice.", details: { reason: "dc-has-invoice" } };
    const { client } = fakeFetch(409, body);
    const error = await client.request("dc.delete", { params: { id: ID } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, body, message: "This DC has an invoice." });
  });

  it("falls back to a plain message when the error body is not one", async () => {
    const { client } = fakeFetch(502, "<html>Bad gateway</html>");
    const error = await client.request("health.get").catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 502,
      body: { code: "http-502", message: "Something went wrong. Try again." },
    });
  });
});

describe("createClient: calls are typed by the table", () => {
  it("rejects a missing param, a wrong body and an unknown route at compile time", () => {
    const { client } = fakeFetch(200, {});
    const never = () => {
      // @ts-expect-error -- `po.detail` needs `params.id`
      void client.request("po.detail", {});
      // @ts-expect-error -- quantities are milli-unit numbers, not wire strings
      void client.request("po.setManualDispatched", { params: { id: ID, itemId: ITEM }, body: { qty: "4" } });
      // @ts-expect-error -- not in the route table
      void client.request("analytics.procurement");
    };
    expect(typeof never).toBe("function");
  });
});

function openByType(open: number) {
  return {
    QTY_MISMATCH: open,
    DOC_NUMBER_CONFLICT: 0,
    OVER_DISPATCH: 0,
    OVER_INVOICE: 0,
    DOC_ON_CANCELLED_ITEM: 0,
    MANUAL_ADJUSTMENT_OVERLAP: 0,
  };
}

const poItemWire = {
  id: ITEM,
  poId: ID,
  poItemNo: 10,
  materialCode: "MAT-001",
  description: "Synthetic bracket",
  drawingNo: null,
  unit: "NOS",
  ordQty: "10",
  rateSource: "848.75",
  rate: "848.75",
  poRcdQty: "0",
  poRejQty: null,
  cancelledAt: null,
  manualDispatchedQty: "4",
  manualNote: "sent by hand",
  manualSetAt: "2025-04-03T05:30:00Z",
  dspQty: "4",
  rcdQty: "0",
  rejQty: "0",
  balanceQty: "6",
  uninvoicedQty: "4",
  status: "Pending",
};
