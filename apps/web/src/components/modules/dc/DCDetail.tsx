import { dcListTotals, qtyValue, sumQty } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useClientPage } from "../../../hooks/useClientPage.ts";
import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { useDownload } from "../../../lib/download.ts";
import { Delete, Edit, FileText, Invoice } from "../../../lib/icons.ts";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  ExcelButton,
  InfoField,
  PageHeader,
  QueryState,
  StatusBadge,
  useToast,
} from "../../common/index.ts";
import { dcDeleteReason } from "../delete-reasons.ts";
import { DCHeaderEdit } from "./DCHeaderEdit.tsx";

type Detail = RouteOutput<"dc.detail">;
type Line = Detail["items"][number];
type PoItem = RouteOutput<"po.detail">["items"][number];

function columns(gemc: boolean): Column<Line>[] {
  return [
    { key: "poItemNo", header: "Item", width: "64px", render: (line) => String(line.poItemNo) },
    {
      key: "material",
      header: "Material",
      width: "320px",
      title: (line) => [line.materialCode, line.description, line.drawingNo].filter(Boolean).join(" · "),
      render: (line) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 role-material-code">{line.materialCode ?? "—"}</span>
          <span className="truncate role-material-description">{line.description ?? ""}</span>
        </span>
      ),
    },
    { key: "unit", header: "Unit", width: "64px", render: (line) => line.unit ?? "—" },
    {
      key: "dspQty",
      header: "Qty",
      width: "96px",
      align: "right",
      render: (line) => <span className="tabular-nums">{fmtQty(line.dspQty)}</span>,
    },
    { key: "rate", header: "Rate", width: "120px", align: "right", render: (line) => fmtRate(line.rate, { gemc }) },
    {
      key: "value",
      header: "Value",
      width: "130px",
      align: "right",
      render: (line) => <span className="tabular-nums">{fmtMoney(qtyValue(line.dspQty, line.rate), { gemc })}</span>,
    },
  ];
}

/**
 * The DC's totals as the legacy page showed them (EC-38): dispatched and value over its lines, and received as each
 * line's PO item received, read from the PO; `null` until the PO has loaded.
 */
export function dcTotals(lines: readonly Line[], poItems: readonly PoItem[] | undefined) {
  const item = new Map((poItems ?? []).map((i) => [i.id, i]));
  const none = sumQty([]);
  const { dspQty, rcdQty, value } = dcListTotals(
    lines.map((l) => ({
      ordQty: item.get(l.poItemId)?.ordQty ?? none,
      dspQty: l.dspQty,
      rcdQty: item.get(l.poItemId)?.rcdQty ?? none,
      rate: l.rate,
    })),
  );
  return { dspQty, value, rcdQty: poItems === undefined ? null : rcdQty };
}

function Note({ tag, children }: { readonly tag: string; readonly children: string }) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2">
      <span className="mr-2 role-ui-label">{tag}</span>
      <span className="role-body-text">{children}</span>
    </div>
  );
}

function DCDetailView({ data }: { readonly data: Detail }) {
  const { dc, po, items, invoice, srvs } = data;
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const download = useDownload();
  const poDetail = useQuery(apiQuery("po.detail", { params: { id: po.id } }));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const paged = useClientPage(items);
  const gemc = po.isGemc;
  const totals = dcTotals(items, poDetail.data?.items);
  const blocked = dcDeleteReason(data);
  const value = fmtMoney(totals.value, { gemc });

  async function remove() {
    setBusy(true);
    try {
      await api.request("dc.delete", { params: { id: dc.id } });
      toast("Deleted", `DC ${dc.number} deleted`, "success");
      await invalidate("dc", "po");
      void navigate({ to: "/dc" });
    } catch (error) {
      toast("Failed", error instanceof Error ? error.message : "Error", "error");
      setDeleting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={dc.number}
        backTo="/dc"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{fmtCount(items.length)} items</span>
            <span className="opacity-40">•</span>
            <span>Value: {value}</span>
            {srvs.length > 0 && (
              <>
                <span className="opacity-40">•</span>
                <span className="inline-flex gap-1">
                  SRV:
                  {srvs.map((srv) => (
                    <Link key={srv.id} to="/srv/$id" params={{ id: srv.id }} className="role-reference-link">
                      {srv.number}
                    </Link>
                  ))}
                </span>
              </>
            )}
          </span>
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExcelButton
              loading={download.busy === "dc"}
              onClick={() =>
                void download.run("dc", `DC ${dc.number}`, () => api.request("dc.excel", { params: { id: dc.id } }))
              }
            >
              <FileText aria-hidden />
              DC
            </ExcelButton>
            <ExcelButton
              loading={download.busy === "gc"}
              onClick={() =>
                void download.run("gc", `GC ${dc.gcNumber}`, () => api.request("dc.gcExcel", { params: { id: dc.id } }))
              }
            >
              <FileText aria-hidden />
              GC
            </ExcelButton>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit aria-hidden />
              Edit
            </Button>
            {invoice === null ? (
              <Button size="sm" asChild>
                <Link to="/invoice/create" search={{ dc: dc.id }}>
                  <Invoice aria-hidden />
                  Create Invoice
                </Link>
              </Button>
            ) : (
              // One invoice per DC (INV-28).
              <Button size="sm" disabled>
                <Invoice aria-hidden />
                Create Invoice
              </Button>
            )}
            {blocked && <span className="role-helper-text">{blocked}</span>}
            <Button
              variant="outline"
              size="icon"
              className="text-error"
              disabled={blocked !== null}
              title={blocked ?? `Delete DC ${dc.number}`}
              aria-label={blocked ?? `Delete DC ${dc.number}`}
              onClick={() => setDeleting(true)}
            >
              <Delete aria-hidden />
            </Button>
          </div>
        }
      />
      <section aria-label="Challan Details" className="rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 role-section-title">Challan Details</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <InfoField label="DC Number" value={dc.number} />
          <InfoField label="DC Date" value={fmtDate(dc.dcDate)} />
          <InfoField
            label="PO Reference"
            value={
              <Link to="/po/$id" params={{ id: po.id }} className="role-reference-link">
                {po.poNumber}
              </Link>
            }
          />
          <InfoField label="Department" value={dc.departmentNo} />
          <InfoField label="GC Number" value={dc.gcNumber} />
          <InfoField label="GC Date" value={fmtDate(dc.gcDate)} />
          <InfoField
            label="Invoice Status"
            value={
              invoice ? (
                <Link to="/invoice/$id" params={{ id: invoice.id }} title={`Invoice ${invoice.number}`}>
                  <StatusBadge status="success">Created</StatusBadge>
                </Link>
              ) : (
                <StatusBadge status="warning">Pending</StatusBadge>
              )
            }
          />
          <InfoField label="Our Ref" value={dc.ourRef} />
          <InfoField label="Consignee" value={dc.consigneeName} wide />
          <InfoField label="Consignee Address" value={dc.consigneeAddress} wide />
        </div>
      </section>
      <section aria-label="Line items" className="flex flex-col gap-2">
        <div className="flex items-center gap-6 px-1">
          <span className="role-section-title">Line Items</span>
          <span className="role-metadata">
            Dispatched <span className="role-field-value tabular-nums">{fmtQty(totals.dspQty)}</span>
          </span>
          <span className="role-metadata">
            Received{" "}
            <span className="role-field-value tabular-nums">
              {totals.rcdQty === null ? "—" : fmtQty(totals.rcdQty)}
            </span>
          </span>
        </div>
        <DataTable columns={columns(gemc)} emptyText="No items" {...paged} />
      </section>
      <section aria-label="Notes / Remarks" className="rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 role-section-title">Notes / Remarks</h2>
        <div className="flex flex-col gap-2">
          <Note tag="GC">{`Guarantee Certificate No. ${dc.gcNumber} Dt. ${fmtDate(dc.gcDate)}`}</Note>
          <Note tag="VAL">{`Consignment Value of DC ${value}`}</Note>
          {remarkNotes(dc.remarks).map((note, i) => (
            <div key={`${i}-${note}`} className="rounded-md bg-surface-sunken/30 px-3 py-2 role-page-subtitle">
              {note}
            </div>
          ))}
        </div>
      </section>
      <DCHeaderEdit dc={dc} open={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => void remove()}
        title="Delete Delivery Challan?"
        warningText={`Delete DC #${dc.number}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}

/** The user's notes as the create form wrote them: one per blank-line-separated block. */
export const remarkNotes = (remarks: string | null): string[] =>
  (remarks ?? "")
    .trim()
    .split("\n\n")
    .filter((note) => note.trim() !== "");

/** `/dc/:id` (SPEC-18 §2): the DC header, lines, GC line, linked invoice and SRVs, downloads, edit and delete. */
export function DCDetail({ id }: { readonly id: string }) {
  const detail = useQuery(apiQuery("dc.detail", { params: { id } }));
  if (!detail.data) return <QueryState error={detail.error} />;
  return <DCDetailView data={detail.data} />;
}
