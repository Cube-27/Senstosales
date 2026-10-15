// The register exports and the DC and invoice list CSVs (SPEC-13 PR 3).
import type { Handlers } from "../app.ts";
import type { RegistersService } from "../services/registers.ts";

export function registersRoutes(registers: RegistersService) {
  return {
    "reports.poRegisterExport": ({ query }) => registers.poRegister(query),
    "reports.dcRegisterExport": ({ query }) => registers.dcRegister(query),
    "reports.invoiceRegisterExport": ({ query }) => registers.invoiceRegister(query),
    "dc.export": ({ query }) => registers.dcList(query),
    "invoice.export": ({ query }) => registers.invoiceList(query),
  } satisfies Handlers;
}
