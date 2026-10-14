// SPEC-07 PR 1: route mounting from the route table, the codecs at the boundary and the one error shape.
import type { FetchLike } from "@senstosales/schemas";
import { ApiError, createClient, zGstPct, zMoney } from "@senstosales/schemas";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "../src/errors.ts";
import { json, testApp } from "./helpers.ts";

const ID = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";
const nine = z.decode(zGstPct, "9");
const buyerWire = { unitName: "Unit A", state: "State B", stateCode: "09", gstin: null };

const zInvalidInput = z.object({
  code: z.literal("invalid-input"),
  message: z.string(),
  details: z.object({ fields: z.array(z.object({ path: z.string(), message: z.string().min(1) })) }),
});

/** A 400 body that names the invalid fields. */
const invalidInput = async (res: Response) => zInvalidInput.parse(await res.json());

/** The typed web client over the app, as the SPA will call it. */
function clientOf(send: ReturnType<typeof testApp>["send"]) {
  const fetchImpl: FetchLike = async (url, init) => send(url, init);
  return createClient(fetchImpl);
}

describe("mounting from the route table", () => {
  it("decodes the body through the codecs and encodes the response", async () => {
    let seen: unknown;
    const { send } = testApp({
      "settings.update": ({ body }) => {
        seen = body;
        return body;
      },
    });
    const res = await send("/api/settings", json("PUT", { cgstPct: "9", sgstPct: "2.5", preferences: { a: "b" } }));
    expect(res.status).toBe(200);
    expect(seen).toEqual({ cgstPct: 900000, sgstPct: 250000, preferences: { a: "b" } });
    expect(await res.json()).toEqual({ cgstPct: "9", sgstPct: "2.5", preferences: { a: "b" } });
  });

  it("round-trips through the typed client", async () => {
    const { send } = testApp({ "settings.get": () => ({ cgstPct: nine, sgstPct: nine, preferences: {} }) });
    const settings = await clientOf(send).request("settings.get");
    expect(settings).toEqual({ cgstPct: 900000, sgstPct: 900000, preferences: {} });
  });

  it("passes path ids to the handler", async () => {
    const { send } = testApp({ "buyers.update": ({ params, body }) => ({ id: params.id, ...body }) });
    const buyer = await clientOf(send).request("buyers.update", { params: { id: ID }, body: buyerWire });
    expect(buyer).toEqual({ id: ID, ...buyerWire });
  });

  it("fills query defaults and reads repeated keys as an array", async () => {
    let seen: unknown;
    const { send } = testApp({
      "search.query": ({ query }) => {
        seen = query;
        return [];
      },
    });
    await send("/api/search?q=abc&types=po&types=dc&valueMin=10.5");
    expect(seen).toEqual({ q: "abc", types: ["po", "dc"], valueMin: z.decode(zMoney, "10.5") });
    await send("/api/search?q=abc&types=po");
    expect(seen).toEqual({ q: "abc", types: ["po"] });
  });

  it("applies list defaults", async () => {
    let seen: unknown;
    const { send } = testApp({
      "po.list": ({ query }) => {
        seen = query;
        return { items: [], total: 0 };
      },
    });
    const res = await send("/api/po");
    expect(await res.json()).toEqual({ items: [], total: 0 });
    expect(seen).toEqual({ page: 1, pageSize: 10, dir: "asc" });
  });

  it("sends a download with its legacy file name", async () => {
    const { send } = testApp({
      "invoice.export": () => ({ fileName: "Invoices 2024-25.xlsx", bytes: new Uint8Array([1, 2, 3]) }),
    });
    const res = await send("/api/invoice/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''Invoices%202024-25.xlsx");
    const download = await clientOf(send).request("invoice.export");
    expect(download).toEqual({ fileName: "Invoices 2024-25.xlsx", bytes: new Uint8Array([1, 2, 3]) });
  });

  it("does not answer a route with no handler", async () => {
    const { send } = testApp({});
    const res = await send("/api/buyers");
    expect(res.status).toBe(404);
  });
});

describe("validation errors (400)", () => {
  const { send } = testApp({
    "buyers.create": ({ body }) => ({ id: ID, ...body }),
    "buyers.update": ({ params, body }) => ({ id: params.id, ...body }),
    "po.list": () => ({ items: [], total: 0 }),
  });

  it("names each invalid field by its path", async () => {
    const res = await send("/api/buyers", json("POST", { unitName: 5, state: null, stateCode: null }));
    expect(res.status).toBe(400);
    const body = await invalidInput(res);
    expect(body.message).toBe("Some details are missing or not valid.");
    expect(body.details.fields.map((f) => f.path)).toEqual(["body.unitName", "body.gstin"]);
  });

  it("refuses a malformed path id", async () => {
    const res = await send("/api/buyers/not-an-id", json("PUT", buyerWire));
    expect(res.status).toBe(400);
    expect((await invalidInput(res)).details.fields.map((f) => f.path)).toEqual(["params.id"]);
  });

  it("refuses an unknown sort column and a bad page size", async () => {
    const res = await send("/api/po?sort=secret&pageSize=7");
    expect(res.status).toBe(400);
    const paths = (await invalidInput(res)).details.fields.map((f) => f.path);
    expect(paths).toEqual(["query.pageSize", "query.sort"]);
  });

  it("refuses a body that is not JSON", async () => {
    const res = await send("/api/buyers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad-json", message: "The request could not be read." });
  });

  it("does not echo the values it refused", async () => {
    const res = await send("/api/buyers", json("POST", { ...buyerWire, unitName: { pw: "hunter2-value" } }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("hunter2-value");
  });
});

describe("errors use one body shape", () => {
  it.each([
    [new ValidationError("bad-thing", "That is not valid."), 400],
    [new AuthError("login-required", "Please log in."), 401],
    [new ForbiddenError("not-allowed", "You cannot do that."), 403],
    [new NotFoundError("po-not-found", "This PO was not found."), 404],
    [new ConflictError("dc-number-taken", "DC 12 already exists in 2024-25.", { number: "12" }), 409],
    [new PayloadTooLargeError("too-large", "Too large."), 413],
    [new UnsupportedMediaTypeError("json-only", "Send JSON."), 415],
  ])("%s answers its status with { code, message, details? }", async (error, status) => {
    const { send } = testApp({
      "buyers.list": () => {
        throw error;
      },
    });
    const res = await send("/api/buyers");
    expect(res.status).toBe(status);
    const expected = error.details
      ? { code: error.code, message: error.message, details: error.details }
      : {
          code: error.code,
          message: error.message,
        };
    expect(await res.json()).toEqual(expected);
  });

  it("the client reads the same shape", async () => {
    const { send } = testApp({
      "buyers.list": () => {
        throw new NotFoundError("buyer-not-found", "This buyer was not found.");
      },
    });
    const err = await clientOf(send)
      .request("buyers.list")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, body: { code: "buyer-not-found", message: "This buyer was not found." } });
  });

  it("an unexpected failure is a plain 500 and is logged, without its message in the body", async () => {
    const { send, logger } = testApp({
      "buyers.list": () => {
        throw new Error("SQLITE_BUSY: internal detail");
      },
    });
    const res = await send("/api/buyers");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code: "internal", message: "Something went wrong. Please try again." });
    expect(text).not.toContain("SQLITE_BUSY");
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toMatchObject({
      level: "error",
      message: "request failed",
      fields: { method: "GET", path: "/api/buyers", error: "Error: SQLITE_BUSY: internal detail" },
    });
  });

  it("an unknown API path is a 404 in the same shape", async () => {
    const { send } = testApp();
    const res = await send("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "not-found", message: "This page or item was not found." });
  });
});
