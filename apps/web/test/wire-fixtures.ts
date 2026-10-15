// Synthetic API payloads shared by the screen tests (C1): the supplier profile and a job row.
export const SUPPLIER = {
  id: "01J0000000000000000000000S",
  name: "Example Works",
  gstin: null,
  address: null,
  state: null,
  stateCode: null,
  contact: null,
  email: null,
  bhelSupplierCode: null,
  bankDetails: {},
  invoiceDefaults: {},
};

export const JOB_ID = "01J000000000000000000000JB";

/** A just-started job row; `over` sets its type, status, progress or summary. */
export const job = (over: Record<string, unknown> = {}) => ({
  id: JOB_ID,
  type: "backup",
  status: "queued",
  createdAt: "2026-10-15T04:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  cancelRequested: false,
  progress: { total: 0, done: 0, skipped: 0, failed: 0, current: null },
  error: null,
  summary: null,
  ...over,
});
