// Delivery challans and their lines (ARCHITECTURE §8.2). Header fields are the ones the legacy DC form and edit
// dialog show (SPEC-11 §9); they are the only fields an edit may change (INV-33).
import { z } from "zod";

import { zFy, zId, zInstant, zIsoDate, zPackets, zQty } from "../primitives.ts";
import { zSupplierSnapshot } from "./supplier.ts";

const text = z.string().nullable();

/** Editable DC header fields. */
export const zDcHeader = z.object({
  ourRef: text,
  departmentNo: text,
  consigneeName: text,
  consigneeGstin: text,
  consigneeAddress: text,
  inspectionCompany: text,
  ewayBillNo: text,
  vehicleNo: text,
  lrNo: text,
  transporter: text,
  modeOfTransport: text,
  remarks: text,
  /** The invoice the DC sheet cites, as the user fills it in (EC-47); blank prints the DC's own invoice. */
  invoiceNumber: text,
  invoiceDate: zIsoDate.nullable(),
  /** The DC sheet's lot line, typed by the user; not a PO lot (owner, 2026-10-16). */
  lotNo: text,
  ...zSupplierSnapshot.shape,
});

export const zDc = z.object({
  id: zId,
  poId: zId,
  /** Unique per FY (INV-22). */
  number: z.string().min(1),
  dcDate: zIsoDate,
  financialYear: zFy,
  /** Defaults to the DC number and date; unique in the DC's FY (INV-26). */
  gcNumber: z.string().min(1),
  gcDate: zIsoDate,
  ...zDcHeader.shape,
  version: z.int().positive(),
  createdAt: zInstant,
});

/** A DC line; its quantity never changes after save (INV-33). */
export const zDcItem = z.object({
  id: zId,
  dcId: zId,
  poItemId: zId,
  dspQty: zQty,
  /** Packets the line ships in, as the user enters them; the daily dispatch summary prints them. */
  packets: zPackets,
  createdAt: zInstant,
});
