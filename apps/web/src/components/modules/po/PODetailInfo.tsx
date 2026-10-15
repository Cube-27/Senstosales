import type { RouteOutput } from "@senstosales/schemas";
import { fmtDate, fmtMoney } from "@senstosales/schemas";
import { type ReactNode, useState } from "react";

import { FileText, Info, Receipt, ShieldCheck } from "../../../lib/icons.ts";
import { DetailTabs } from "../../common/index.ts";
import { type RawField, rawValue } from "./header-fields.ts";
import { StatusCell } from "./status.tsx";

type Po = RouteOutput<"po.detail">["po"];

const TABS = [
  { id: "basic", label: "Basic", icon: Info },
  { id: "references", label: "References", icon: FileText },
  { id: "financial", label: "Financial", icon: Receipt },
  { id: "issuer", label: "Issuer", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

function InfoItem({
  label,
  value,
  wide = false,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly wide?: boolean | undefined;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <div className="mb-1 role-field-label">{label}</div>
      <div className="truncate role-field-value">{value === "" || value === null ? "—" : value}</div>
    </div>
  );
}

/** Each tab's fields as legacy labelled them: a label, its value and whether it spans two columns. */
function fields(po: Po): Record<TabId, readonly [string, ReactNode, boolean?][]> {
  const raw = (field: RawField) => rawValue(po.rawHeader, field);
  const money = (m: Po["poValue"]) => (m === null ? "" : fmtMoney(m, { gemc: po.isGemc }));
  return {
    basic: [
      ["PO Number", po.poNumber],
      ["PO Date", fmtDate(po.poDate)],
      ["Status", <StatusCell key="status" status={po.status} />],
      ["Name", raw("supplierName"), true],
      ["Supplier Code", raw("supplierCode")],
      ["GSTIN", raw("supplierGstin")],
      ["Phone", raw("phone")],
      ["Email", raw("email")],
      ["Our Ref", raw("ourRef")],
      ["Dept No", raw("department")],
    ],
    references: [
      ["Enquiry No", po.enquiry],
      ["Enquiry Date", raw("enquiryDate")],
      ["Quotation Ref", po.quotation],
      ["Quotation Date", raw("quotationDate")],
      ["RC Number", raw("rcNo")],
      ["Order Type", po.orderType],
      ["AMD Number", String(po.amendNo)],
      ["GEMC No", po.gemcNumber],
      ["GEMC Date", raw("gemcDate")],
    ],
    financial: [
      ["PO Value", money(po.poValue)],
      ["FOB Value", raw("fobValue")],
      ["Net Value", money(po.netPoValue)],
      ["TIN No", raw("tinNo")],
      ["ECC No", raw("eccNo")],
      ["MPCT No", raw("mpctNo")],
      ["Currency", raw("currency")],
      ["Ex Rate", raw("exRate")],
    ],
    issuer: [
      ["Inspection By", raw("inspectionBy")],
      ["Inspection At", raw("inspectionAt")],
      ["Consignee", raw("consignee"), true],
      ["Issuer Name", raw("issuerName")],
      ["Designation", raw("designation")],
    ],
  };
}

/**
 * The PO header in the legacy tabs. The panel keeps one height for every tab, so switching tabs moves nothing below
 * it (C8).
 */
export function PODetailInfo({ po }: { readonly po: Po }) {
  const [tab, setTab] = useState<TabId>("basic");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <DetailTabs tabs={TABS} activeTab={tab} onChange={(id) => setTab(TABS.find((t) => t.id === id)?.id ?? "basic")} />
      <div role="tabpanel" id={`${tab}-panel`} aria-labelledby={`${tab}-tab`} className="h-52 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-4 lg:grid-cols-6">
          {fields(po)[tab].map(([label, value, wide]) => (
            <InfoItem key={label} label={label} value={value} wide={wide} />
          ))}
        </div>
        {tab === "issuer" && (
          <div className="mt-4 border-t border-border pt-2">
            <div className="mb-1.5 role-field-label">Remarks</div>
            <div className="role-field-value">{po.remarks || <span className="role-empty-text">No remarks</span>}</div>
          </div>
        )}
      </div>
    </div>
  );
}
