import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtMoney } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, type FieldPathByValue, useFieldArray, useForm, type UseFormRegister } from "react-hook-form";

import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { Delete, Plus, Save } from "../../../lib/icons.ts";
import { todayIst } from "../../../lib/today.ts";
import {
  Button,
  ConfirmDialog,
  DatePicker,
  FormAlert,
  FormField,
  Input,
  PageHeader,
  QuantityInput,
  QueryState,
  Textarea,
} from "../../common/index.ts";
import {
  emptyForm,
  formBody,
  formError,
  formFromDetail,
  type FormValues,
  formTotal,
  itemValue,
  newItem,
} from "./po-form.ts";

type Detail = RouteOutput<"po.detail">;

type TextField = { readonly name: FieldPathByValue<FormValues, string>; readonly label: string };

/** The legacy form's header fields after PO Number and PO Date, in its order; a wide field takes two columns. */
const HEADER: readonly (TextField & { readonly wide?: true })[] = [
  { name: "raw.department", label: "Department" },
  { name: "orderType", label: "Order Type" },
  { name: "raw.supplierCode", label: "Supplier Code" },
  { name: "raw.supplierName", label: "Supplier Name", wide: true },
  { name: "raw.supplierGstin", label: "Supplier GSTIN" },
  { name: "quotation", label: "Quotation Ref" },
  { name: "raw.rcNo", label: "RC Number" },
  { name: "raw.tinNo", label: "TIN No" },
  { name: "raw.eccNo", label: "ECC No" },
  { name: "raw.mpctNo", label: "MPCT No" },
  { name: "raw.ourRef", label: "Our Ref" },
  { name: "gemcNumber", label: "GEMC No" },
];

function TextInput({ field, register }: Readonly<{ field: TextField; register: UseFormRegister<FormValues> }>) {
  return (
    <FormField label={field.label}>
      <Input {...register(field.name)} />
    </FormField>
  );
}

const cell = "px-2 py-2";

interface POFormProps {
  /** The PO to edit; a new PO when absent. */
  readonly detail?: Detail | undefined;
}

/**
 * `/po/create` (SPEC-16 §2): the legacy manual PO form, for a new PO or, from the PO page's Edit, a stored one. A
 * GEMC PO's rates are typed GST-inclusive and the API stores the net (INV-20). A new PO is confirmed before saving,
 * as legacy did.
 */
function POFormView({ detail }: POFormProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const invalidate = useInvalidate();
  const editing = detail !== undefined;
  const storedItemNos = detail?.items.map((i) => i.poItemNo) ?? [];
  const form = useForm<FormValues>({ defaultValues: detail ? formFromDetail(detail) : emptyForm(todayIst()) });
  const { register, control, watch, getValues } = form;
  const items = useFieldArray({ control, name: "items" });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const values = watch();
  const total = formTotal(values.items);
  const gemc = values.gemcNumber.trim() !== "";

  async function save() {
    setConfirming(false);
    setSaving(true);
    try {
      const body = formBody(getValues(), detail?.po);
      const po = detail
        ? await api.request("po.update", {
            params: { id: detail.po.id },
            body: { ...body, version: detail.po.version },
          })
        : await api.request("po.create", { body });
      await invalidate("po");
      void navigate({ to: "/po/$id", params: { id: po.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Purchase Order");
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    const problem = formError(getValues());
    setError(problem);
    if (problem !== null) return;
    if (editing) void save();
    else setConfirming(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={editing ? "Edit Purchase Order" : "Create Purchase Order"}
        subtitle={`${fmtCount(values.items.length)} items • Total: ${fmtMoney(total, { gemc })}`}
        onBack={() => router.history.back()}
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => router.history.back()} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              loading={saving}
              disabled={values.poNumber.trim() === "" || values.items.length === 0}
            >
              <Save aria-hidden />
              {saving ? "Saving..." : "Save PO"}
            </Button>
          </>
        }
      />
      <FormAlert message={error} />
      <section aria-label="Header Information" className="rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 role-section-title">Header Information</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4 lg:grid-cols-6">
          <FormField label="PO Number" required>
            <Input {...register("poNumber")} placeholder="PO-001" />
          </FormField>
          <Controller
            control={control}
            name="poDate"
            render={({ field }) => (
              <FormField label="PO Date" required>
                <DatePicker value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
          {HEADER.map((field) => (
            <div key={field.name} className={field.wide ? "col-span-2" : undefined}>
              <TextInput field={field} register={register} />
            </div>
          ))}
          <Controller
            control={control}
            name="gemcDate"
            render={({ field }) => (
              <FormField label="GEMC Date">
                <DatePicker value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
          <div className="col-span-2">
            <TextInput field={{ name: "raw.inspectionAt", label: "Inspection Terms" }} register={register} />
          </div>
          <div className="col-span-2">
            <TextInput field={{ name: "raw.consignee", label: "Consignee Name" }} register={register} />
          </div>
        </div>
      </section>
      <section aria-label="Line Items" className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="role-section-title">Line Items</h2>
          <Button variant="outline" size="sm" onClick={() => items.append(newItem(getValues("items"), storedItemNos))}>
            <Plus aria-hidden />
            Add Item
          </Button>
        </div>
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-12" />
            <col />
            <col className="w-36" />
            <col className="w-20" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-12" />
          </colgroup>
          <thead className="bg-surface-sunken/50">
            <tr className="border-b border-border">
              {["#", "Material", "Code", "Unit", "Qty", "Rate", "Value", ""].map((h, i) => (
                <th
                  key={h || i}
                  scope="col"
                  className={`${cell} role-table-header ${i >= 4 && i <= 6 ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.fields.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center role-body-text">
                  No items added. Click &quot;Add Item&quot; to begin.
                </td>
              </tr>
            ) : (
              items.fields.map((row, i) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className={`${cell} text-center role-metadata`}>{i + 1}</td>
                  <td className={cell}>
                    <Input
                      {...register(`items.${i}.description`)}
                      placeholder="Description"
                      aria-label={`Description of item ${i + 1}`}
                    />
                  </td>
                  <td className={cell}>
                    <Input
                      {...register(`items.${i}.materialCode`)}
                      placeholder="Code"
                      aria-label={`Code of item ${i + 1}`}
                    />
                  </td>
                  <td className={cell}>
                    <Input {...register(`items.${i}.unit`)} placeholder="NOS" aria-label={`Unit of item ${i + 1}`} />
                  </td>
                  <td className={cell}>
                    <Controller
                      control={control}
                      name={`items.${i}.ordQty`}
                      render={({ field }) => (
                        <QuantityInput
                          value={field.value}
                          onChange={field.onChange}
                          className="text-right"
                          aria-label={`Qty of item ${i + 1}`}
                        />
                      )}
                    />
                  </td>
                  <td className={cell}>
                    <Input
                      {...register(`items.${i}.rate`)}
                      inputMode="decimal"
                      placeholder="0"
                      className="text-right"
                      aria-label={`Rate of item ${i + 1}`}
                      title={gemc ? "GST-inclusive rate" : undefined}
                    />
                  </td>
                  <td className={`${cell} text-right role-table-cell tabular-nums`}>
                    {fmtMoney(itemValue(values.items[i] ?? row), { gemc })}
                  </td>
                  <td className={`${cell} text-center`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove item ${i + 1}`}
                      onClick={() => items.remove(i)}
                    >
                      <Delete className="text-error" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {items.fields.length > 0 && (
            <tfoot>
              <tr className="bg-surface-sunken/50">
                <td colSpan={6} className={`${cell} text-right role-field-label`}>
                  Total
                </td>
                <td className={`${cell} text-right role-reference-number-lg`}>{fmtMoney(total, { gemc })}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
        {gemc && (
          <p className="border-t border-border px-4 py-2 role-helper-text">
            GEMC PO: enter each rate including GST; the net rate is stored.
          </p>
        )}
      </section>
      <section aria-label="Additional Details" className="rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 role-section-title">Additional Details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Consignee Address">
            <Textarea {...register("raw.consigneeAddress")} className="min-h-24" placeholder="Enter address..." />
          </FormField>
          <FormField label="Remarks">
            <Textarea {...register("remarks")} className="min-h-24" placeholder="Enter remarks..." />
          </FormField>
        </div>
      </section>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void save()}
        loading={saving}
        title="Confirm Purchase Order Creation"
        warningText="This will create the PO with the current header and line-item values."
        confirmLabel="Create PO"
        cancelLabel="Review"
        variant="warning"
      />
    </div>
  );
}

/** The form for a new PO, or for the PO `id` once it has loaded. */
export function POForm({ id }: { readonly id?: string | undefined }) {
  const detail = useQuery({ ...apiQuery("po.detail", { params: { id: id ?? "" } }), enabled: id !== undefined });
  if (id === undefined) return <POFormView />;
  if (!detail.data) return <QueryState error={detail.error} />;
  return <POFormView key={detail.data.po.version} detail={detail.data} />;
}
