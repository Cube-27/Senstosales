// The golden projection agrees with the writer on the catalog's layout, so export tests compare content only.
import { EXPORTS, xlsxChunks } from "@senstosales/documents";
import { describe, expect, it } from "vite-plus/test";

import type { WorkbookGolden } from "./golden.ts";
import { workbookGolden, workbookGoldenFile } from "./golden.ts";

async function bytesOf(chunks: AsyncIterable<Uint8Array>) {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  return new Uint8Array(Buffer.concat(parts));
}

async function* none() {}

/** The golden's own rows written back through the catalog's sheet. */
async function* rowsOf(keys: readonly string[], golden: WorkbookGolden) {
  for (const row of golden.rows.slice(1)) {
    yield Object.fromEntries(keys.map((key, i) => [key, row[i] as string | number | null]));
  }
}

describe("workbookGolden", () => {
  it("projects the bare sheet of an empty list workbook onto its golden (EC-45)", async () => {
    const golden = workbookGoldenFile("po-register-empty.json");
    const bytes = await bytesOf(xlsxChunks(EXPORTS.poRegister.sheet, none()));
    expect(await workbookGolden(bytes, "PO_Register.xlsx", golden.styles)).toEqual(golden);
  });

  it("projects a list workbook with rows: header style, widths, page setup, footer and values", async () => {
    const golden = workbookGoldenFile("dc-register.json");
    const { sheet } = EXPORTS.dcRegister;
    const bytes = await bytesOf(
      xlsxChunks(
        sheet,
        rowsOf(
          sheet.columns.map((c) => c.key),
          golden,
        ),
      ),
    );
    expect(await workbookGolden(bytes, golden.fileName, golden.styles)).toEqual(golden);
  });
});
