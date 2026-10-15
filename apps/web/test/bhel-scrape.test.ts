// SPEC-19 PR 5: the Pipeline Configuration as a scrape request; PO ids as INV-97 checks them.
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_CONFIG, scrapeBody } from "../src/components/modules/bhel-sync/scrape.ts";

const S = "01J00000000000000000000SES";

describe("scrapeBody (SPEC-19 PR 5)", () => {
  it.each([
    ["PO", DEFAULT_CONFIG, { body: { type: "po.scrape", sessionId: S, limit: 1 } }],
    ["SRV", { limit: " 250 ", poNumbers: "" }, { body: { type: "srv.scrape", sessionId: S, limit: 250 } }],
    ["PO", { limit: "5000", poNumbers: "" }, { body: { type: "po.scrape", sessionId: S, limit: 5000 } }],
    [
      "PO",
      { limit: "1", poNumbers: "4500001, 4500002\n4500003" },
      { body: { type: "po.scrape", sessionId: S, poIds: ["4500001", "4500002", "4500003"] } },
    ],
    [
      "SRV",
      { limit: "oops", poNumbers: " 4500001 ," },
      { body: { type: "srv.scrape", sessionId: S, poIds: ["4500001"] } },
    ],
    ["PO", { limit: "1", poNumbers: "4500001, 45A0002" }, { error: "Not a PO number: 45A0002" }],
    ["PO", { limit: "1", poNumbers: "12345678901" }, { error: "Not a PO number: 12345678901" }],
    ["PO", { limit: "0", poNumbers: "" }, { error: "Batch Limit is a whole number from 1 to 5,000" }],
    ["PO", { limit: "5001", poNumbers: "" }, { error: "Batch Limit is a whole number from 1 to 5,000" }],
    ["PO", { limit: "2.5", poNumbers: "" }, { error: "Batch Limit is a whole number from 1 to 5,000" }],
    ["PO", { limit: "", poNumbers: "" }, { error: "Batch Limit is a whole number from 1 to 5,000" }],
  ] as const)("%s %j", (kind, config, expected) => {
    expect(scrapeBody(kind, S, config)).toEqual(expected);
  });
});
