import type { IsoDate } from "@senstosales/domain";
import { type RouteOutput, zDcHeader } from "@senstosales/schemas";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { api, useInvalidate } from "../../../lib/api.ts";
import { blankToNull } from "../../../lib/text.ts";
import { DatePicker, FormDialog, FormField, Input, Textarea, useToast } from "../../common/index.ts";

type Dc = RouteOutput<"dc.detail">["dc"];

interface Values {
  readonly departmentNo: string;
  readonly gcNumber: string;
  readonly gcDate: IsoDate | "";
  readonly ourRef: string;
  readonly consigneeName: string;
  readonly consigneeAddress: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: IsoDate | "";
}

const valuesOf = (dc: Dc): Values => ({
  departmentNo: dc.departmentNo ?? "",
  gcNumber: dc.gcNumber,
  gcDate: dc.gcDate,
  ourRef: dc.ourRef ?? "",
  consigneeName: dc.consigneeName ?? "",
  consigneeAddress: dc.consigneeAddress ?? "",
  invoiceNumber: dc.invoiceNumber ?? "",
  invoiceDate: dc.invoiceDate ?? "",
});

/** The update body: the stored header with the edited fields, the DC's own number and date, and its version. */
function updateBody(dc: Dc, v: Values) {
  return {
    ...zDcHeader.parse(dc),
    number: dc.number,
    dcDate: dc.dcDate,
    version: dc.version,
    departmentNo: blankToNull(v.departmentNo),
    ourRef: blankToNull(v.ourRef),
    consigneeName: blankToNull(v.consigneeName),
    consigneeAddress: blankToNull(v.consigneeAddress),
    // A cleared GC number or date takes the DC's (INV-26).
    gcNumber: blankToNull(v.gcNumber),
    gcDate: v.gcDate === "" ? null : v.gcDate,
    invoiceNumber: blankToNull(v.invoiceNumber),
    invoiceDate: v.invoiceDate === "" ? null : v.invoiceDate,
  };
}

interface DCHeaderEditProps {
  readonly dc: Dc;
  readonly open: boolean;
  onClose(): void;
}

/**
 * The DC header edit (SPEC-18 §2, INV-33): the fields the legacy page edited, in a dialog over the page so editing
 * moves nothing (C8). Lines and quantities never change after save.
 */
export function DCHeaderEdit({ dc, open, onClose }: Readonly<DCHeaderEditProps>) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const { register, control, getValues, reset } = useForm<Values>({ values: valuesOf(dc) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    reset(valuesOf(dc));
    setError(null);
    onClose();
  };

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.request("dc.update", { params: { id: dc.id }, body: updateBody(dc, getValues()) });
      toast("Updated", `DC ${dc.number} updated`, "success");
      await invalidate("dc");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={close}
      title={`Edit DC ${dc.number}`}
      error={error}
      saving={saving}
      onSave={() => void save()}
    >
      <div className="grid grid-cols-2 gap-x-4">
        <FormField label="Department">
          <Input {...register("departmentNo")} />
        </FormField>
        <FormField label="Our Ref">
          <Input {...register("ourRef")} />
        </FormField>
        <FormField label="GC Number">
          <Input {...register("gcNumber")} />
        </FormField>
        <Controller
          control={control}
          name="gcDate"
          render={({ field }) => (
            <FormField label="GC Date">
              <DatePicker value={field.value} onChange={field.onChange} />
            </FormField>
          )}
        />
        <FormField label="Consignee" className="col-span-2">
          <Input {...register("consigneeName")} />
        </FormField>
        <FormField label="Consignee Address" className="col-span-2">
          <Textarea {...register("consigneeAddress")} className="min-h-16" />
        </FormField>
        {/* The invoice the DC sheet cites, filled in by the user (EC-47); blank prints the DC's own invoice. */}
        <FormField label="Invoice No">
          <Input {...register("invoiceNumber")} />
        </FormField>
        <Controller
          control={control}
          name="invoiceDate"
          render={({ field }) => (
            <FormField label="Invoice Date">
              <DatePicker value={field.value} onChange={field.onChange} />
            </FormField>
          )}
        />
      </div>
    </FormDialog>
  );
}
