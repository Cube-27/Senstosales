// Closed value sets shared by the API and the web client. Each list is the one ARCHITECTURE names; item and PO
// status match the domain's types (the enums test checks they stay equal); flag types come from the domain.
import { FLAG_TYPES } from "@senstosales/domain";
import { z } from "zod";

/** ARCHITECTURE §6.11 (INV-62). */
export const zItemStatus = z.enum(["Pending", "Delivered", "Closed", "Cancelled"]);

/** ARCHITECTURE §6.11 (INV-64). */
export const zPoStatus = z.enum(["Pending", "Delivered", "Closed"]);

/** The v1 flag types (INV-58, A-24), owned by the domain. */
export const zFlagType = z.enum(FLAG_TYPES);

/** Flag lifecycle `open -> acknowledged` (ARCHITECTURE §5.3). */
export const zFlagStatus = z.enum(["open", "acknowledged"]);

/** ARCHITECTURE §7.3. */
export const zJobType = z.enum([
  "po.scrape",
  "srv.scrape",
  "po.import-folder",
  "srv.import-folder",
  "recompute-all",
  "backup",
]);

/** Job lifecycle `queued -> running -> done | failed | cancelled` (ARCHITECTURE §5.3). */
export const zJobStatus = z.enum(["queued", "running", "done", "failed", "cancelled"]);

/** `invoice.kind` (ARCHITECTURE §8.2): DC-sourced or PO-direct. */
export const zInvoiceKind = z.enum(["dc", "direct"]);
