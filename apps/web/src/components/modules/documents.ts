// The four document types as the screens name, mark and open them (legacy labels and icons).
import { DeliveryChallan, type Icon, Invoice, PurchaseOrder, StoreReceipt } from "../../lib/icons.ts";
import type { DocType } from "./search/filters.ts";

export const DOC: Record<
  DocType,
  { label: string; plural: string; icon: Icon; page: "/po/$id" | "/dc/$id" | "/invoice/$id" | "/srv/$id" }
> = {
  po: { label: "PO", plural: "Purchase Orders", icon: PurchaseOrder, page: "/po/$id" },
  dc: { label: "DC", plural: "Delivery Challans", icon: DeliveryChallan, page: "/dc/$id" },
  invoice: { label: "Invoice", plural: "Invoices", icon: Invoice, page: "/invoice/$id" },
  srv: { label: "SRV", plural: "SRVs", icon: StoreReceipt, page: "/srv/$id" },
};
