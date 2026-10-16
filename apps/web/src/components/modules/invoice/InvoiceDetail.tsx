import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";

import { useClientPage } from "../../../hooks/useClientPage.ts";
import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { useDownload } from "../../../lib/download.ts";
import { Delete, Edit, FileText } from "../../../lib/icons.ts";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  ExcelButton,
  InfoField,
  MaterialCell,
  materialTitle,
  PageHeader,
  QueryState,
  useToast,
} from "../../common/index.ts";
import { invoiceDeleteReason } from "../delete-reasons.ts";
import { LinkedSrvs } from "../doc-screens.tsx";
import { InvoiceHeaderEdit } from "./InvoiceHeaderEdit.tsx";
import { PartyBlock, SourceLink } from "./parties.tsx";

type Detail = RouteOutput<"invoice.detail">;
type Line = Detail["items"][number];

/**
 * Widths from the measured text at 1366 (1086 px for the table, D-0627): Taxable and Total fit a GEMC line amount up
 * to ₹99,999.12345, CGST and SGST their 9 % share, Qty `1,234.567`, HSN eight digits; Material takes the rest.
 */
function columns(gemc: boolean, sn: (line: Line) => number): Column<Line>[] {
  const money = (key: "taxable" | "cgst" | "sgst" | "total", header: string, width: string): Column<Line> => ({
    key,
    header,
    width,
    align: "right",
    // A larger amount than the widths fit is cut; the title holds it in full.
    title: (line) => fmtMoney(line[key], { gemc }),
    render: (line) => <span className="tabular-nums">{fmtMoney(line[key], { gemc })}</span>,
  });
  return [
    { key: "sn", header: "S.N.", width: "48px", render: (line) => String(sn(line)) },
    {
      key: "material",
      header: "Material",
      width: "auto",
      title: (line) => materialTitle(line.materialCode, line.description, line.drawingNo),
      render: (line) => <MaterialCell code={line.materialCode} description={line.description} />,
    },
    { key: "hsn", header: "HSN", width: "104px", title: (line) => line.hsn ?? "", render: (line) => line.hsn ?? "—" },
    { key: "unit", header: "Unit", width: "60px", render: (line) => line.unit ?? "—" },
    {
      key: "qty",
      header: "Qty",
      width: "104px",
      align: "right",
      render: (line) => <span className="tabular-nums">{fmtQty(line.qty)}</span>,
    },
    { key: "rate", header: "Rate", width: "120px", align: "right", render: (line) => fmtRate(line.rate, { gemc }) },
    money("taxable", "Taxable", "140px"),
    money("cgst", "CGST", "132px"),
    money("sgst", "SGST", "132px"),
    money("total", "Total", "140px"),
  ];
}

/** The document fields on the right of the legacy invoice sheet, by label. */
function documentFields({ invoice, po, dc }: Detail): readonly [string, ReactNode, boolean?][] {
  return [
    ["Invoice No.", invoice.number],
    ["Dated", fmtDate(invoice.invoiceDate)],
    [dc ? "Challan No" : "Source PO", <SourceLink key="source" po={po} dc={dc} />],
    ["Challan Date", fmtDate(dc?.date ?? null)],
    ["GEMC No", invoice.gemcNumber],
    ["GEMC Date", fmtDate(invoice.gemcDate)],
    [
      "Buyer's Order No.",
      <Link key="po" to="/po/$id" params={{ id: po.id }} className="role-reference-link">
        {po.poNumber}
      </Link>,
    ],
    ["Order Date", fmtDate(invoice.buyersOrderDate)],
    ["SRV No", invoice.srvNo],
    ["SRV Date", fmtDate(invoice.srvDate)],
    ["Payment Terms", invoice.paymentTerms],
    ["Despatch Doc No.", invoice.despatchDocNo],
    ["Despatched Through", invoice.transporter],
    ["Destination", invoice.destination],
    ["Vehicle No", invoice.vehicleNo],
    ["LR No", invoice.lrNo],
    ["Terms of Delivery", invoice.termsOfDelivery, true],
  ];
}

function InvoiceDetailView({ data }: { readonly data: Detail }) {
  const { invoice, po, dc, items, srvs } = data;
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const download = useDownload();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const paged = useClientPage(items);
  const gemc = po.isGemc;
  const cols = useMemo(() => {
    const index = new Map(items.map((line, i) => [line.id, i + 1]));
    return columns(gemc, (line) => index.get(line.id) ?? 0);
  }, [items, gemc]);
  const blocked = invoiceDeleteReason(data);

  async function remove() {
    setBusy(true);
    try {
      await api.request("invoice.delete", { params: { id: invoice.id } });
      toast("Deleted", `Invoice ${invoice.number} deleted`, "success");
      // Leave first, so the deleted invoice's page is not refetched.
      await navigate({ to: "/invoice" });
      void invalidate("invoice", "dc", "po");
    } catch (error) {
      toast("Failed", error instanceof Error ? error.message : "Unknown error", "error");
      setDeleting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={invoice.number}
        backTo="/invoice"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex gap-1">
              {dc ? "DC:" : "PO:"} <SourceLink po={po} dc={dc} />
            </span>
            <span className="opacity-40">•</span>
            <span>{fmtCount(items.length)} items</span>
            <span className="opacity-40">•</span>
            <span>{fmtMoney(invoice.total, { gemc })}</span>
            <LinkedSrvs srvs={srvs} />
          </span>
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExcelButton
              loading={download.busy === "invoice"}
              onClick={() =>
                void download.run("invoice", `Invoice ${invoice.number}`, () =>
                  api.request("invoice.excel", { params: { id: invoice.id } }),
                )
              }
            >
              <FileText aria-hidden />
              Download
            </ExcelButton>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit aria-hidden />
              Edit
            </Button>
            {blocked && <span className="role-helper-text">{blocked}</span>}
            <Button
              variant="outline"
              size="icon"
              className="text-error"
              disabled={blocked !== null}
              title={blocked ?? `Delete Invoice ${invoice.number}`}
              aria-label={blocked ?? `Delete Invoice ${invoice.number}`}
              onClick={() => setDeleting(true)}
            >
              <Delete aria-hidden />
            </Button>
          </div>
        }
      />
      <section aria-label="Invoice Details" className="overflow-hidden rounded-md border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 role-section-title">Invoice Details</h2>
        <div className="grid grid-cols-12">
          <div className="col-span-4 flex flex-col border-r border-border">
            <PartyBlock title="Supplier Details" name={invoice.supplierName} address={invoice.supplierAddress}>
              {[
                ["GSTIN:", invoice.supplierGstin],
                ["TEL:", invoice.supplierContact],
              ]}
            </PartyBlock>
            <PartyBlock title="Billed To (Buyer)" name={invoice.buyerName} address={invoice.buyerAddress}>
              {[
                ["GSTIN:", invoice.buyerGstin],
                ["STATE:", invoice.buyerState],
                ["POS:", invoice.placeOfSupply],
              ]}
            </PartyBlock>
          </div>
          <div className="col-span-8 grid grid-cols-4 content-start gap-x-6 gap-y-4 p-4">
            {documentFields(data).map(([label, value, wide]) => (
              <div key={label} className={wide ? "col-span-4" : undefined}>
                <InfoField label={label} value={value} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section aria-label="Line Items" className="flex flex-col gap-2">
        <span className="px-1 role-section-title">Line Items</span>
        <DataTable columns={cols} emptyText="No items" {...paged} />
      </section>
      <InvoiceHeaderEdit invoice={invoice} open={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => void remove()}
        title="Delete Invoice?"
        warningText={`Delete Invoice #${invoice.number}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}

/** `/invoice/:id` (SPEC-18 §2): header, lines with taxes, linked SRVs, header edit, delete with reason, Excel. */
export function InvoiceDetail({ id }: { readonly id: string }) {
  const detail = useQuery(apiQuery("invoice.detail", { params: { id } }));
  if (!detail.data) return <QueryState error={detail.error} />;
  return <InvoiceDetailView data={detail.data} />;
}
