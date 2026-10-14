// The OpenAPI 3.1 document for the route table (SPEC-04 §4.1, INV-101). `tools/gen/src/openapi.ts` writes it to
// `generated/openapi.json`, and CI fails when the committed file is stale. Schemas are the wire side of each codec
// (`io: "input"`), so quantities and money appear as the decimal strings they are sent as (C3).
import { z } from "zod";

import { zErrorBody } from "./api/common.ts";
import { zAuditEntry } from "./entities/audit.ts";
import { zDc, zDcItem } from "./entities/dc.ts";
import { zFlag } from "./entities/flag.ts";
import { zInvoice, zInvoiceItem } from "./entities/invoice.ts";
import { zJob, zJobEvent } from "./entities/job.ts";
import { zPo, zPoItem, zPoLot } from "./entities/po.ts";
import { zSrv, zSrvItem } from "./entities/srv.ts";
import { zBuyer, zSupplier, zSupplierSnapshot } from "./entities/supplier.ts";
import { zFlagStatus, zFlagType, zInvoiceKind, zItemStatus, zJobStatus, zJobType, zPoStatus } from "./enums.ts";
import { zFy, zGstPct, zId, zInstant, zIsoDate, zMoney, zPoId, zQty } from "./primitives.ts";
import type { RouteDef } from "./routes.ts";

type JsonSchema = z.core.JSONSchema.BaseSchema;

interface Parameter {
  name: string;
  in: "path" | "query";
  required?: true;
  schema: JsonSchema;
}

interface Operation {
  operationId: string;
  security?: [];
  parameters?: Parameter[];
  requestBody?: { required: true; content: { "application/json": { schema: JsonSchema } } };
  responses: Record<"200" | "default", { description: string; content: Record<string, { schema?: JsonSchema }> }>;
}

export interface OpenApiDoc {
  openapi: "3.1.0";
  info: { title: string; version: string };
  security: [{ session: [] }];
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes: { session: { type: "apiKey"; in: "cookie"; name: "session" } };
    schemas: Record<string, JsonSchema>;
  };
}

interface ComponentMeta {
  id: string;
  description?: string;
}

/** Schemas shared by name under `components.schemas`; only the ones some route uses are emitted. */
const COMPONENTS: readonly [z.ZodType, ComponentMeta][] = [
  [zId, { id: "Id", description: "A ULID." }],
  [zPoId, { id: "PoId", description: "A BHEL PO id." }],
  [zQty, { id: "Qty", description: 'A quantity as an exact decimal string, such as "2.5".' }],
  [zMoney, { id: "Money", description: 'An amount as an exact decimal string, such as "719.27966".' }],
  [zGstPct, { id: "GstPct", description: 'A tax percentage as an exact decimal string, such as "9".' }],
  [zIsoDate, { id: "IsoDate", description: "A calendar date, `YYYY-MM-DD`." }],
  [zInstant, { id: "Instant", description: "An instant, ISO-8601 UTC." }],
  [zFy, { id: "Fy", description: 'A financial year, such as "2024-25".' }],
  [zPoStatus, { id: "PoStatus" }],
  [zItemStatus, { id: "ItemStatus" }],
  [zFlagType, { id: "FlagType" }],
  [zFlagStatus, { id: "FlagStatus" }],
  [zJobType, { id: "JobType" }],
  [zJobStatus, { id: "JobStatus" }],
  [zInvoiceKind, { id: "InvoiceKind" }],
  [zErrorBody, { id: "ErrorBody" }],
  [zSupplier, { id: "Supplier" }],
  [zSupplierSnapshot, { id: "SupplierSnapshot" }],
  [zBuyer, { id: "Buyer" }],
  [zPo, { id: "Po" }],
  [zPoItem, { id: "PoItem" }],
  [zPoLot, { id: "PoLot" }],
  [zDc, { id: "Dc" }],
  [zDcItem, { id: "DcItem" }],
  [zInvoice, { id: "Invoice" }],
  [zInvoiceItem, { id: "InvoiceItem" }],
  [zSrv, { id: "Srv" }],
  [zSrvItem, { id: "SrvItem" }],
  [zFlag, { id: "Flag" }],
  [zAuditEntry, { id: "AuditEntry" }],
  [zJob, { id: "Job" }],
  [zJobEvent, { id: "JobEvent" }],
];

const registry = z.registry<ComponentMeta>();
for (const [schema, meta] of COMPONENTS) registry.add(schema, meta);

const json = (schema: JsonSchema) => ({ "application/json": { schema } });

export function buildOpenApi(table: Readonly<Record<string, RouteDef>>): OpenApiDoc {
  // One conversion over every schema in the table, so a registered schema becomes one `$defs` entry and a `$ref`
  // wherever it is used.
  const slots: Record<string, z.ZodType> = { errorBody: zErrorBody };
  for (const [name, def] of Object.entries(table)) {
    if (def.params) slots[`${name}:params`] = def.params;
    if (def.query) slots[`${name}:query`] = def.query;
    if (def.body) slots[`${name}:body`] = def.body;
    if (def.response !== "file") slots[`${name}:response`] = def.response;
  }
  const converted = z.toJSONSchema(z.object(slots), { io: "input", metadata: registry });
  const { properties: schemas = {}, $defs = {} } = toComponentRefs(converted) as JsonSchema;

  const paths: OpenApiDoc["paths"] = {};
  for (const [name, def] of Object.entries(table)) {
    const path = def.path.replace(/:(\w+)/g, "{$1}");
    paths[path] = {
      ...paths[path],
      [def.method.toLowerCase()]: operation(name, def, schemas),
    };
  }
  const sorted = Object.fromEntries(Object.entries($defs).sort(([a], [b]) => a.localeCompare(b)));
  return {
    openapi: "3.1.0",
    info: { title: "SenstoSales API", version: "1" },
    security: [{ session: [] }],
    paths,
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "session" } },
      schemas: sorted as Record<string, JsonSchema>,
    },
  };
}

function operation(name: string, def: RouteDef, schemas: Record<string, JsonSchema | boolean>): Operation {
  const parameters = [
    ...toParameters("path", schemas[`${name}:params`]),
    ...toParameters("query", schemas[`${name}:query`]),
  ];
  const body = schemas[`${name}:body`];
  const response = schemas[`${name}:response`];
  return {
    operationId: name,
    ...(def.public ? { security: [] } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(typeof body === "object" ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      "200":
        typeof response === "object"
          ? { description: "OK", content: json(response) }
          : { description: "A file, named by `Content-Disposition`.", content: { "application/octet-stream": {} } },
      default: {
        description: "An error: `{ code, message, details? }`.",
        content: json({ $ref: "#/components/schemas/ErrorBody" }),
      },
    },
  };
}

/** A path or query object's properties as OpenAPI parameters; a path parameter is always required. */
function toParameters(where: Parameter["in"], object: JsonSchema | boolean | undefined): Parameter[] {
  if (typeof object !== "object") return [];
  const required = new Set(object.required);
  return Object.entries(object.properties ?? {}).map(([name, schema]) => ({
    name,
    in: where,
    ...(where === "path" || required.has(name) ? { required: true as const } : {}),
    schema: schema as JsonSchema,
  }));
}

/** Zod points a registered schema's `$ref` at `#/$defs/<id>`; in OpenAPI the shared schemas are components. */
function toComponentRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toComponentRefs);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) =>
      key === "$ref" && typeof value === "string"
        ? [key, value.replace(/^#\/\$defs\//, "#/components/schemas/")]
        : [key, toComponentRefs(value)],
    ),
  );
}
