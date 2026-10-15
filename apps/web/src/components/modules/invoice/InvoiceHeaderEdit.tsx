import type { IsoDate } from "@senstosales/domain";
import { type RouteOutput, zInvoiceHeader } from "@senstosales/schemas";
import { useState } from "react";
import { Controller, type FieldPathByValue, useForm } from "react-hook-form";

import { api, useInvalidate } from "../../../lib/api.ts";
import { blankToNull } from "../../../lib/text.ts";
import { DatePicker, FormDialog, FormField, Input, Textarea, useToast } from "../../common/index.ts";

type Invoice = RouteOutput<"invoice.detail">["invoice"];

/** The text fields the legacy page edited, by label, in its order. */
const TEXT = [
  ["gemcNumber", "GEMC No"],
  ["srvNo", "SRV No"],
  ["paymentTerms", "Payment Terms"],
  ["despatchDocNo", "Despatch Doc No."],
  ["transporter", "Despatched Through"],
  ["destination", "Destination"],
  ["vehicleNo", "Vehicle No"],
  ["lrNo", "LR No"],
  ["termsOfDelivery", "Terms of Delivery"],
] as const;

type TextKey = (typeof TEXT)[number][0] | "buyerName" | "buyerAddress" | "buyerGstin" | "buyerState";
type DateKey = "invoiceDate" | "gemcDate" | "srvDate";

type InvoiceEditValues = Record<TextKey, string> & Record<DateKey, IsoDate | "">;

const orBlank = (s: string | null): string => s ?? "";
function valuesOf(i: Invoice): InvoiceEditValues {
  return {
    invoiceDate: i.invoiceDate,
    buyerName: orBlank(i.buyerName),
    buyerAddress: orBlank(i.buyerAddress),
    buyerGstin: orBlank(i.buyerGstin),
    buyerState: orBlank(i.buyerState),
    gemcNumber: orBlank(i.gemcNumber),
    gemcDate: i.gemcDate ?? "",
    srvNo: orBlank(i.srvNo),
    srvDate: i.srvDate ?? "",
    paymentTerms: orBlank(i.paymentTerms),
    despatchDocNo: orBlank(i.despatchDocNo),
    transporter: orBlank(i.transporter),
    destination: orBlank(i.destination),
    vehicleNo: orBlank(i.vehicleNo),
    lrNo: orBlank(i.lrNo),
    termsOfDelivery: orBlank(i.termsOfDelivery),
  };
}

/** The legacy edit checks, in its order and words. */
function invoiceEditError(v: InvoiceEditValues): string | null {
  if (v.invoiceDate === "") return "Invoice date is required.";
  if (v.buyerName.trim() === "") return "Buyer name is required.";
  if (v.buyerAddress.trim() === "") return "Buyer address is required.";
  return null;
}

/** The update body: the stored header with the edited fields, the invoice's number and its version (INV-33). */
function invoiceUpdateBody(invoice: Invoice, v: InvoiceEditValues, invoiceDate: IsoDate) {
  return {
    ...zInvoiceHeader.parse(invoice),
    buyerName: blankToNull(v.buyerName),
    buyerAddress: blankToNull(v.buyerAddress),
    buyerGstin: blankToNull(v.buyerGstin),
    buyerState: blankToNull(v.buyerState),
    gemcNumber: blankToNull(v.gemcNumber),
    srvNo: blankToNull(v.srvNo),
    paymentTerms: blankToNull(v.paymentTerms),
    despatchDocNo: blankToNull(v.despatchDocNo),
    transporter: blankToNull(v.transporter),
    destination: blankToNull(v.destination),
    vehicleNo: blankToNull(v.vehicleNo),
    lrNo: blankToNull(v.lrNo),
    termsOfDelivery: blankToNull(v.termsOfDelivery),
    number: invoice.number,
    // A changed date moves the invoice to its new FY (INV-25).
    invoiceDate,
    gemcDate: v.gemcDate === "" ? null : v.gemcDate,
    srvDate: v.srvDate === "" ? null : v.srvDate,
    version: invoice.version,
  };
}

function DateField({
  name,
  label,
  control,
  required = false,
}: {
  readonly name: FieldPathByValue<InvoiceEditValues, IsoDate | "">;
  readonly label: string;
  readonly control: ReturnType<typeof useForm<InvoiceEditValues>>["control"];
  readonly required?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormField label={label} required={required}>
          <DatePicker value={field.value} onChange={field.onChange} />
        </FormField>
      )}
    />
  );
}

interface InvoiceHeaderEditProps {
  readonly invoice: Invoice;
  readonly open: boolean;
  onClose(): void;
}

/**
 * The invoice header edit (SPEC-18 §2, INV-33): the fields the legacy page edited, in a dialog over the page so
 * editing moves nothing (C8). Lines, quantities, rates and taxes never change after save.
 */
export function InvoiceHeaderEdit({ invoice, open, onClose }: Readonly<InvoiceHeaderEditProps>) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { register, control, getValues, reset } = useForm<InvoiceEditValues>({ values: valuesOf(invoice) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    reset(valuesOf(invoice));
    setError(null);
    onClose();
  };

  async function save() {
    const values = getValues();
    const problem = invoiceEditError(values);
    setError(problem);
    if (problem !== null || values.invoiceDate === "") return;
    setSaving(true);
    try {
      const body = invoiceUpdateBody(invoice, values, values.invoiceDate);
      await api.request("invoice.update", { params: { id: invoice.id }, body });
      toast("Updated", `Invoice ${invoice.number} updated`, "success");
      await invalidate("invoice");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={close}
      title={`Edit Invoice ${invoice.number}`}
      error={error}
      saving={saving}
      onSave={() => void save()}
    >
      <div className="grid max-h-[60vh] grid-cols-2 gap-x-4 overflow-y-auto pr-1">
        <DateField name="invoiceDate" label="Dated" control={control} required />
        <FormField label="Buyer Name" required>
          <Input {...register("buyerName")} />
        </FormField>
        <FormField label="Buyer Address" required className="col-span-2">
          <Textarea {...register("buyerAddress")} className="min-h-12" />
        </FormField>
        <FormField label="GSTIN">
          <Input {...register("buyerGstin")} />
        </FormField>
        <FormField label="State">
          <Input {...register("buyerState")} />
        </FormField>
        {TEXT.map(([key, label]) => (
          <FormField key={key} label={label} className={key === "termsOfDelivery" ? "col-span-2" : ""}>
            <Input {...register(key)} />
          </FormField>
        ))}
        <DateField name="gemcDate" label="GEMC Date" control={control} />
        <DateField name="srvDate" label="SRV Date" control={control} />
      </div>
    </FormDialog>
  );
}
