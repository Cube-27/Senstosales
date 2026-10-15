// The synthetic dataset behind every report golden (SPEC-13 §6, C1): three POs, three DCs, two invoices and one SRV,
// today 2025-06-01 at 11:00 IST, report range 2025-03-01 to 2025-05-31. Quantities are milli-units and money 1e-5
// units (C3), as the tables store them; the derived item columns are worked by hand from ARCHITECTURE §6.2, §6.3
// and §6.11 so the goldens can be checked against them. SPEC-13 PR 3–5 seed this data and compare their exports.

export const TODAY = "2025-06-01";
export const NOW_IST = { date: "2025-06-01", time: "11:00" };
export const RANGE = { from: "2025-03-01", to: "2025-05-31" };

export const SUPPLIER = {
  name: "Example Supplier",
  address: "1 Example Road, Example City",
  contact: "000-000-0000",
};

export const POS = [
  { key: "A", poNumber: "4500101", poDate: "2025-04-02", poValue: 1100_00000, gemcNumber: null, status: "Pending" },
  {
    key: "B",
    poNumber: "4500102",
    poDate: "2025-04-20",
    poValue: 1180_00000,
    gemcNumber: "GEMC-0001",
    status: "Pending",
  },
  { key: "C", poNumber: "4500103", poDate: "2025-03-15", poValue: 50_00000, gemcNumber: null, status: "Closed" },
] as const;

/**
 * Derived columns: A10 dsp 6 + 3 (DCs), rcd 6 (SRV wins), balance 10 - max(6, 9) = 1, Pending. A20 dsp 5, rcd 4,
 * rej 1, balance 0, Delivered. B10 dsp 1.25, balance 1.25, Pending. C10 dsp 4 (PO-direct invoice), rcd 4 (PO wins,
 * no SRV), balance 0, Closed.
 */
export const ITEMS = [
  {
    key: "A10",
    po: "A",
    poItemNo: 10,
    materialCode: "M-110",
    description: "Hex bolt M10",
    unit: "NOS",
    ordQty: 10_000,
    rate: 100_00000,
    poRcdQty: 0,
    derived: { dspQty: 9_000, rcdQty: 6_000, rejQty: 0, balanceQty: 1_000, status: "Pending" },
  },
  {
    key: "A20",
    po: "A",
    poItemNo: 20,
    materialCode: "M-120",
    description: "Plain washer",
    unit: "NOS",
    ordQty: 5_000,
    rate: 20_00000,
    poRcdQty: 0,
    derived: { dspQty: 5_000, rcdQty: 4_000, rejQty: 1_000, balanceQty: 0, status: "Delivered" },
  },
  {
    key: "B10",
    po: "B",
    poItemNo: 10,
    materialCode: "M-210",
    /** A repeated line: the pending summary writes it once. */
    description: "Gasket set\nGasket set\nSize 50",
    unit: "SET",
    ordQty: 2_500,
    /** GEMC: the PO states 472 GST-inclusive; the net rate is 400 (INV-17). */
    rateSource: 472_00000,
    rate: 400_00000,
    poRcdQty: 0,
    derived: { dspQty: 1_250, rcdQty: 0, rejQty: 0, balanceQty: 1_250, status: "Pending" },
  },
  {
    key: "C10",
    po: "C",
    poItemNo: 10,
    materialCode: "M-310",
    description: "Spring pin",
    unit: "NOS",
    ordQty: 4_000,
    rate: 12_50000,
    poRcdQty: 4_000,
    derived: { dspQty: 4_000, rcdQty: 4_000, rejQty: 0, balanceQty: 0, status: "Closed" },
  },
] as const;

export const LOTS = [
  { item: "A10", lotNo: 1, delyQty: 6_000, delyDate: "2025-05-20", entryAllowDate: "2025-05-15" },
  { item: "A10", lotNo: 2, delyQty: 4_000, delyDate: "2025-06-10", entryAllowDate: null },
  { item: "A20", lotNo: 1, delyQty: 5_000, delyDate: "2025-05-25", entryAllowDate: "2025-05-20" },
  { item: "B10", lotNo: 1, delyQty: 2_500, delyDate: "2025-06-15", entryAllowDate: "2025-06-12" },
  { item: "C10", lotNo: 1, delyQty: 4_000, delyDate: "2025-04-10", entryAllowDate: null },
] as const;

/** FY 2025-26. The `+` consignee pins the CSV formula guard (INV-94). */
export const DCS = [
  {
    number: "101",
    dcDate: "2025-04-25",
    po: "A",
    consigneeName: "Example Works Unit",
    lines: [
      { item: "A10", dspQty: 6_000 },
      { item: "A20", dspQty: 5_000 },
    ],
  },
  {
    number: "102",
    dcDate: "2025-05-10",
    po: "A",
    consigneeName: "+Example Store",
    lines: [{ item: "A10", dspQty: 3_000 }],
  },
  {
    number: "103",
    dcDate: "2025-05-28",
    po: "B",
    consigneeName: "Example Works Unit",
    lines: [{ item: "B10", dspQty: 1_250 }],
  },
] as const;

/** 201 is sourced from DC 101 (CGST + SGST 9% each); 202 is PO-direct on PO C (IGST 18%). */
export const INVOICES = [
  {
    number: "201",
    invoiceDate: "2025-04-26",
    po: "A",
    dc: "101",
    lines: [
      { item: "A10", qty: 6_000, rate: 100_00000 },
      { item: "A20", qty: 5_000, rate: 20_00000 },
    ],
    taxable: 700_00000,
    cgst: 63_00000,
    sgst: 63_00000,
    igst: 0,
    total: 826_00000,
  },
  {
    number: "202",
    invoiceDate: "2025-05-30",
    po: "C",
    dc: null,
    lines: [{ item: "C10", qty: 4_000, rate: 12_50000 }],
    taxable: 50_00000,
    cgst: 0,
    sgst: 0,
    igst: 9_00000,
    total: 59_00000,
  },
] as const;

/** Challan 101 and invoice 201 resolve to DC 101 and invoice 201 (INV-37). */
export const SRVS = [
  {
    srvNumber: "301",
    srvDate: "2025-05-05",
    po: "A",
    challanNo: "101",
    invoiceNo: "201",
    lines: [
      { item: "A10", rcdQty: 6_000, rejQty: 0 },
      { item: "A20", rcdQty: 4_000, rejQty: 1_000 },
    ],
  },
] as const;
