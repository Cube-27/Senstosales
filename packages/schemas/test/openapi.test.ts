import { describe, expect, it } from "vite-plus/test";

import { z } from "zod";

import { type RouteDef, routes, zId, zIsoDate, zQty } from "../src/index.ts";
import { buildOpenApi } from "../src/openapi.ts";

const error = {
  description: "An error: `{ code, message, details? }`.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } },
};

describe("buildOpenApi (SPEC-04 §4.1, INV-101)", () => {
  it("documents each entry as one operation, with its wire schemas and shared components", () => {
    const table: Record<string, RouteDef> = {
      "thing.get": {
        method: "GET",
        path: "/api/things/:id",
        params: z.object({ id: zId }),
        response: z.object({ qty: zQty }),
      },
      "thing.list": {
        method: "GET",
        path: "/api/things",
        public: true,
        query: z.object({ q: z.string(), page: z.coerce.number().int().min(1).default(1) }),
        response: z.array(z.string()),
      },
      "thing.export": {
        method: "POST",
        path: "/api/things/export",
        body: z.object({ from: zIsoDate }),
        response: "file",
      },
    };

    expect(buildOpenApi(table)).toEqual({
      openapi: "3.1.0",
      info: { title: "SenstoSales API", version: "1" },
      security: [{ session: [] }],
      paths: {
        "/api/things/{id}": {
          get: {
            operationId: "thing.get",
            parameters: [{ name: "id", in: "path", required: true, schema: { $ref: "#/components/schemas/Id" } }],
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { qty: { $ref: "#/components/schemas/Qty" } },
                      required: ["qty"],
                    },
                  },
                },
              },
              default: error,
            },
          },
        },
        "/api/things": {
          get: {
            operationId: "thing.list",
            security: [],
            parameters: [
              { name: "q", in: "query", required: true, schema: { type: "string" } },
              {
                name: "page",
                in: "query",
                schema: { default: 1, type: "integer", minimum: 1, maximum: 9007199254740991 },
              },
            ],
            responses: {
              "200": {
                description: "OK",
                content: { "application/json": { schema: { type: "array", items: { type: "string" } } } },
              },
              default: error,
            },
          },
        },
        "/api/things/export": {
          post: {
            operationId: "thing.export",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { from: { $ref: "#/components/schemas/IsoDate" } },
                    required: ["from"],
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "A file, named by `Content-Disposition`.",
                content: { "application/octet-stream": {} },
              },
              default: error,
            },
          },
        },
      },
      components: {
        securitySchemes: { session: { type: "apiKey", in: "cookie", name: "session" } },
        schemas: {
          ErrorBody: {
            type: "object",
            properties: {
              code: { type: "string", minLength: 1 },
              message: { type: "string" },
              details: { type: "object", propertyNames: { type: "string" }, additionalProperties: {} },
            },
            required: ["code", "message"],
            additionalProperties: false,
          },
          Id: {
            description: "A ULID.",
            type: "string",
            format: "ulid",
            pattern: "^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$",
          },
          IsoDate: { description: "A calendar date, `YYYY-MM-DD`.", type: "string" },
          Qty: { description: 'A quantity as an exact decimal string, such as "2.5".', type: "string" },
        },
      },
    });
  });

  const doc = buildOpenApi(routes);

  it("has one operation per route, under its OpenAPI path", () => {
    const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => `${op.operationId} ${method.toUpperCase()} ${path}`),
    );
    expect(operations.length).toBe(Object.keys(routes).length);
    expect(operations).toContain("po.setManualDispatched PUT /api/po/{id}/items/{itemId}/manual-dispatched");
    expect(operations).toContain("health.get GET /api/health");
  });

  it("sends quantities, money and rates as strings: no number type outside paging (C3)", () => {
    expect(doc.components.schemas["Qty"]).toEqual({
      description: 'A quantity as an exact decimal string, such as "2.5".',
      type: "string",
    });
    expect(doc.components.schemas["Money"]).toEqual({
      description: 'An amount as an exact decimal string, such as "719.27966".',
      type: "string",
    });
    expect(doc.components.schemas["GstPct"]).toEqual({
      description: 'A tax percentage as an exact decimal string, such as "9".',
      type: "string",
    });
    const numberKeys = new Set<string>();
    const walk = (node: unknown, key: string): void => {
      if (Array.isArray(node)) node.forEach((n) => walk(n, key));
      else if (node !== null && typeof node === "object") {
        const { type, name } = node as { type?: unknown; name?: unknown };
        if (type === "number") numberKeys.add(key);
        const named = typeof name === "string" ? name : key;
        for (const [k, v] of Object.entries(node)) walk(v, k === "schema" ? named : k);
      }
    };
    walk(doc, "");
    expect([...numberKeys]).toEqual(["pageSize"]);
  });
});
