import type { LineTax } from "@senstosales/domain";
import { ApiError } from "@senstosales/schemas/errors";
import { fmtAmountWords, fmtCount, fmtDate, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";

import { useNumberCheck } from "../../../hooks/useNumberCheck.ts";
import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { todayIst } from "../../../lib/today.ts";
import { Save } from "../../../lib/icons.ts";
import {
  Autocomplete,
  Button,
  ConfirmDialog,
  DatePicker,
  FormAlert,
  FormField,
  InfoField,
  Input,
  LineCell,
  type LineColumn,
  LineTable,
  MaterialCell,
  materialTitle,
  PageHeader,
  QuantityInput,
  QueryState,
  Textarea,
} from "../../common/index.ts";
import { DocPicker } from "../DocPicker.tsx";
import { formDefaults, formTotals, type InvoiceFormValues, invoiceCreateBody, type Preview } from "./invoice-form.ts";
import { PartyBlock, PartySection, SourceLink } from "./parties.tsx";

type TextField = Exclude<
  keyof InvoiceFormValues,
  "number" | "invoiceDate" | "gemcDate" | "srvDate" | "qty" | "buyerName" | "buyerAddress" | "buyerStateCode"
>;

/** The legacy free-text document fields after the SRV date, in their order. */
const DOCUMENT_TEXT: readonly (readonly [TextField, string])[] = [
  ["paymentTerms", "Payment Terms"],
  ["despatchDocNo", "Despatch Doc No."],
  ["transporter", "Despatched Through"],
  ["destination", "Destination"],
  ["vehicleNo", "Vehicle No"],
  ["lrNo", "LR No"],
];

/** The buyer: a BHEL unit picked from the list fills the name, GSTIN and state; none is preselected (EC-46). */
function BuyerFields() {
  const { register, setValue, watch } = useFormContext<InvoiceFormValues>();
  const buyers = useQuery(apiQuery("buyers.list"));
  const [search, setSearch] = useState("");
  const all = buyers.data ?? [];
  const options = all
    .filter((b) => b.unitName.toLowerCase().includes(search.trim().toLowerCase()))
    .map((b) => ({ value: b.id, label: b.unitName, subLabel: b.gstin ?? "" }));
  const buyerName = watch("buyerName");
  const chosen = all.find((b) => b.unitName === buyerName);
  return (
    <PartySection title="Billed To (Buyer)" marker="secondary">
      <Autocomplete
        aria-label="Buyer"
        placeholder="Select Buyer..."
        options={options}
        value={chosen?.id ?? buyerName}
        loading={buyers.isFetching}
        onSearch={setSearch}
        onChange={(id) => {
          const buyer = all.find((b) => b.id === id);
          setValue("buyerName", buyer?.unitName ?? "");
          setValue("buyerGstin", buyer?.gstin ?? "");
          setValue("buyerState", buyer?.state ?? "");
          setValue("buyerStateCode", buyer?.stateCode ?? "");
        }}
      />
      <FormField label="Buyer Address">
        <Textarea {...register("buyerAddress")} className="min-h-12" />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="GSTIN">
          <Input {...register("buyerGstin")} />
        </FormField>
        <FormField label="State">
          <Input {...register("buyerState")} />
        </FormField>
      </div>
    </PartySection>
  );
}

function DateField({
  name,
  label,
  required,
}: {
  readonly name: "invoiceDate" | "gemcDate" | "srvDate";
  readonly label: string;
  readonly required?: boolean;
}) {
  const { control } = useFormContext<InvoiceFormValues>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormField label={label} required={required ?? false}>
          <DatePicker value={field.value} onChange={field.onChange} />
        </FormField>
      )}
    />
  );
}

/** The legacy sheet's right grid: the typed number (no suggestion, INV-27), the source and the document fields. */
function DocumentFields({
  preview,
  duplicate,
  onNumberTyped,
}: Readonly<{
  preview: Preview | null;
  duplicate: boolean;
  onNumberTyped(): void;
}>) {
  const { register } = useFormContext<InvoiceFormValues>();
  const dc = preview?.dc ?? null;
  const source = preview && <SourceLink po={preview.po} dc={dc} />;
  return (
    <div className="col-span-8 grid grid-cols-4 content-start gap-x-6 gap-y-3 p-4">
      <FormField label="Invoice No." required error={duplicate ? "Duplicate number" : undefined}>
        <Input {...register("number", { onChange: onNumberTyped })} placeholder="INV-001" autoComplete="off" />
      </FormField>
      <DateField name="invoiceDate" label="Dated" required />
      <InfoField label={dc || !preview ? "Challan No" : "Source PO"} value={source ?? "—"} />
      <InfoField label="Challan Date" value={fmtDate(dc?.date ?? null)} />
      <FormField label="GEMC No">
        <Input {...register("gemcNumber")} />
      </FormField>
      <DateField name="gemcDate" label="GEMC Date" />
      <InfoField
        label="Buyer's Order No."
        value={
          preview ? (
            <Link to="/po/$id" params={{ id: preview.po.id }} className="role-reference-link">
              {preview.po.poNumber}
            </Link>
          ) : (
            "—"
          )
        }
      />
      <InfoField label="Order Date" value={fmtDate(preview?.header.buyersOrderDate ?? null)} />
      <FormField label="SRV No">
        <Input {...register("srvNo")} />
      </FormField>
      <DateField name="srvDate" label="SRV Date" />
      {DOCUMENT_TEXT.map(([name, label]) => (
        <FormField key={name} label={label}>
          <Input {...register(name)} />
        </FormField>
      ))}
      <FormField label="Terms of Delivery" className="col-span-4">
        <Input {...register("termsOfDelivery")} />
      </FormField>
    </div>
  );
}

const COLUMNS: readonly LineColumn[] = [
  { label: "S.N.", width: "w-12", align: "center" },
  { label: "Description", align: "left" },
  { label: "HSN", width: "w-16", align: "center" },
  { label: "Unit", width: "w-16", align: "center" },
  { label: "Qty", width: "w-28", align: "right" },
  { label: "Rate", width: "w-24", align: "right" },
  { label: "Taxable", width: "w-28", align: "right" },
  { label: "CGST", width: "w-24", align: "right" },
  { label: "SGST", width: "w-24", align: "right" },
  { label: "Total", width: "w-28", align: "right" },
];

/** A line's quantity: the DC's, locked (INV-29); or typed, with the uninvoiced quantity as a hint only (INV-05). */
function QtyCell({ preview, i }: { readonly preview: Preview; readonly i: number }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const line = preview.lines[i];
  if (!line) return null;
  if (line.qty !== null) return <span className="tabular-nums">{fmtQty(line.qty)}</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <Controller
        control={control}
        name={`qty.${i}`}
        render={({ field }) => (
          <QuantityInput
            value={field.value}
            onChange={field.onChange}
            className="text-right"
            aria-label={`Invoice qty of item ${line.poItemNo}`}
          />
        )}
      />
      <span className="role-helper-text">Uninvoiced: {fmtQty(line.uninvoicedQty)}</span>
    </span>
  );
}

function LineItems({ preview, taxes }: { readonly preview: Preview | null; readonly taxes: readonly LineTax[] }) {
  const lines = preview?.lines ?? [];
  const gemc = preview?.po.isGemc ?? false;
  let empty: string | null = null;
  if (lines.length === 0) empty = preview ? "No items to invoice." : "Link a DC or PO to load items.";
  const money = (i: number, key: keyof LineTax) => {
    const tax = taxes[i];
    return tax ? fmtMoney(tax[key], { gemc }) : "—";
  };
  return (
    <section aria-label="Line Items" className="overflow-hidden rounded-md border border-border bg-surface">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 role-section-title">
        <span>Line Items</span>
        {preview?.dc === null && <span className="role-helper-text">Select lines and set the invoice qty.</span>}
      </h2>
      <LineTable columns={COLUMNS} empty={empty}>
        {lines.map((line, i) => (
          <tr key={line.poItemId + (line.dcItemId ?? "")} className="border-b border-border/40">
            <LineCell align="center">{i + 1}</LineCell>
            <LineCell title={materialTitle(line.materialCode, line.description)}>
              <MaterialCell code={line.materialCode} description={line.description} />
            </LineCell>
            {/* v1 stores no HSN code (EC-50, EC-61). */}
            <LineCell align="center">—</LineCell>
            <LineCell align="center">{line.unit ?? "—"}</LineCell>
            <LineCell align="right">{preview && <QtyCell preview={preview} i={i} />}</LineCell>
            <LineCell align="right">{fmtRate(line.rate, { gemc })}</LineCell>
            <LineCell align="right">{money(i, "taxable")}</LineCell>
            <LineCell align="right">{money(i, "cgst")}</LineCell>
            <LineCell align="right">{money(i, "sgst")}</LineCell>
            <LineCell align="right">{money(i, "total")}</LineCell>
          </tr>
        ))}
      </LineTable>
    </section>
  );
}

/** The legacy footer, always present so totals never move (C8): amount in words and the tax summary. */
function TotalsFooter({ totals, gemc }: { readonly totals: LineTax; readonly gemc: boolean }) {
  const rows: readonly (readonly [string, LineTax[keyof LineTax]])[] = [
    ["Taxable Value", totals.taxable],
    ["Central Tax", totals.cgst],
    ["State Tax", totals.sgst],
  ];
  return (
    <section aria-label="Totals" className="grid grid-cols-12 rounded-md border border-border bg-surface">
      <div className="col-span-8 border-r border-border p-4">
        <InfoField label="Total Amount (In Words)" value={fmtAmountWords(totals.total)} />
      </div>
      <dl className="col-span-4 flex flex-col gap-1 p-4">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between">
            <dt className="role-field-label">{label}</dt>
            <dd className="tabular-nums role-body-text">{fmtMoney(amount, { gemc })}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-1">
          <dt className="role-field-value">Grand Total</dt>
          <dd className="tabular-nums role-field-value">{fmtMoney(totals.total, { gemc })}</dd>
        </div>
      </dl>
    </section>
  );
}

function SupplierBlock({ preview }: { readonly preview: Preview | null }) {
  const h = preview?.header;
  return (
    <PartyBlock title="Supplier Details" name={h?.supplierName ?? null} address={h?.supplierAddress ?? null}>
      {[
        ["GSTIN:", h?.supplierGstin ?? null],
        ["TEL:", h?.supplierContact ?? null],
      ]}
    </PartyBlock>
  );
}

function Subtitle({ preview, total }: { readonly preview: Preview | null; readonly total: string }) {
  if (preview === null) return <span className="role-metadata">Link a DC or PO to begin</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {preview.dc ? "DC:" : "PO:"} <SourceLink po={preview.po} dc={preview.dc} /> • {fmtCount(preview.lines.length)}{" "}
      items • Total: {total}
    </span>
  );
}

/** The form over a DC's or PO's preview; `preview` is null until one is linked. */
function InvoiceFormView({ preview }: { readonly preview: Preview | null }) {
  const navigate = useNavigate();
  const router = useRouter();
  const invalidate = useInvalidate();
  const form = useForm<InvoiceFormValues>({ defaultValues: formDefaults(preview, todayIst()) });
  const [number, invoiceDate, qty] = form.watch(["number", "invoiceDate", "qty"]);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const check = useNumberCheck("invoice.numberCheck", number, invoiceDate, 3);
  // The number the API refused stays marked until it is changed.
  const duplicate = check.taken || (refused !== null && refused === number.trim());
  // Recomputed each render: react-hook-form keeps the same array while its entries change.
  const { lines: taxes, totals } = formTotals(preview, qty);
  const gemc = preview?.po.isGemc ?? false;

  function submit() {
    if (preview === null) return;
    const body = invoiceCreateBody(preview, form.getValues());
    setError("error" in body ? body.error : null);
    if (!("error" in body)) setConfirming(true);
  }

  async function save() {
    const body = preview && invoiceCreateBody(preview, form.getValues());
    if (!body || "error" in body) return;
    setSaving(true);
    try {
      const invoice = await api.request("invoice.create", { body });
      // Leave first: the refetches (the source page, the number check) need not hold the navigation.
      void navigate({ to: "/invoice/$id", params: { id: invoice.id } });
      void invalidate("invoice", "dc", "po");
    } catch (e) {
      // A taken `(number, FY)` is a 409 that names both (INV-22).
      if (e instanceof ApiError && e.status === 409) setRefused(body.number);
      setError(e instanceof Error ? e.message : "Failed to create invoice");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Create Invoice"
          onBack={() => router.history.back()}
          subtitle={<Subtitle preview={preview} total={fmtMoney(totals.total, { gemc })} />}
          action={
            <>
              {preview === null && (
                <DocPicker
                  types={["dc", "po"]}
                  placeholder="DC/PO Number..."
                  onLink={(hit) =>
                    void navigate({
                      to: "/invoice/create",
                      search: hit.type === "dc" ? { dc: hit.id } : { po: hit.id },
                    })
                  }
                />
              )}
              <Button variant="outline" size="sm" onClick={() => router.history.back()} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submit}
                loading={saving}
                disabled={preview === null || duplicate || check.checking}
              >
                <Save aria-hidden />
                {saving ? "Saving..." : "Save Invoice"}
              </Button>
            </>
          }
        />
        <FormAlert message={error} />
        <section aria-label="Invoice Details" className="overflow-hidden rounded-md border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 role-section-title">Invoice Details</h2>
          <div className="grid grid-cols-12">
            <div className="col-span-4 flex flex-col border-r border-border">
              <SupplierBlock preview={preview} />
              <BuyerFields />
            </div>
            <DocumentFields preview={preview} duplicate={duplicate} onNumberTyped={() => setRefused(null)} />
          </div>
        </section>
        <LineItems preview={preview} taxes={taxes} />
        <TotalsFooter totals={totals} gemc={gemc} />
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => void save()}
          loading={saving}
          title="Generate Invoice?"
          warningText="This will finalize the invoice and update financial records."
          confirmLabel="Generate"
          variant="warning"
        />
      </div>
    </FormProvider>
  );
}

/** `/invoice/create` (SPEC-18 §2): from a DC (lines locked, INV-29) or a PO (any `qty > 0`, INV-31), or link one. */
export function InvoiceForm({
  dcId,
  poId,
}: {
  readonly dcId?: string | undefined;
  readonly poId?: string | undefined;
}) {
  const fromDc = useQuery({
    ...apiQuery("invoice.previewDc", { params: { dcId: dcId ?? "" } }),
    enabled: dcId !== undefined,
  });
  const fromPo = useQuery({
    ...apiQuery("invoice.previewPo", { params: { poId: poId ?? "" } }),
    enabled: dcId === undefined && poId !== undefined,
  });
  const preview = dcId !== undefined ? fromDc : fromPo;
  if (dcId === undefined && poId === undefined) return <InvoiceFormView preview={null} />;
  if (!preview.data) return <QueryState error={preview.error} />;
  return <InvoiceFormView preview={preview.data} />;
}
