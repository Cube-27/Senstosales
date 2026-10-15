import { type IsoDate, qtyValue, type Qty, sumMoney, sumQty } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { ApiError } from "@senstosales/schemas/errors";
import { fmtCount, fmtDate, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext } from "react-hook-form";

import { useNumberCheck } from "../../../hooks/useNumberCheck.ts";
import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { todayIst } from "../../../lib/today.ts";
import { blankToNull } from "../../../lib/text.ts";
import { Save } from "../../../lib/icons.ts";
import {
  Button,
  ConfirmDialog,
  DatePicker,
  FormAlert,
  FormField,
  Input,
  LineCell,
  type LineColumn,
  LineTable,
  MaterialCell,
  materialTitle,
  PageHeader,
  QuantityInput,
  QueryState,
} from "../../common/index.ts";
import { DocPicker } from "../DocPicker.tsx";

type Dispatchable = RouteOutput<"dc.dispatchable">;
type Item = Dispatchable["items"][number];

interface DcFormValues {
  readonly number: string;
  readonly dcDate: IsoDate | "";
  /** `null` until the user types one: the GC follows the DC number and date (INV-26). */
  readonly gcNumber: string | null;
  readonly gcDate: IsoDate | "" | null;
  readonly consigneeName: string;
  readonly ourRef: string;
  /** Dispatch quantity per dispatchable item, in its order. */
  readonly qty: readonly Qty[];
  readonly notes: readonly { readonly text: string }[];
}

/**
 * The create body, or the legacy save check that refuses it, in its order and words. The body is the form over the
 * dispatchable defaults, with only the lines that have a quantity; quantities have no cap (INV-32, C6).
 */
function dcCreateBody(data: Dispatchable, v: DcFormValues) {
  const number = v.number.trim();
  if (number === "" || v.dcDate === "") return { error: "DC Number and Date are required" } as const;
  if (!v.qty.some((q) => q > 0)) return { error: "Please dispatch at least one item." } as const;
  const remarks = v.notes.map((n) => n.text.trim()).filter((n) => n !== "");
  return {
    ...data.defaults,
    poId: data.po.id,
    number,
    dcDate: v.dcDate,
    // A blank GC number or date becomes the DC's (INV-26).
    gcNumber: v.gcNumber === null ? null : blankToNull(v.gcNumber),
    gcDate: v.gcDate === "" ? null : v.gcDate,
    consigneeName: blankToNull(v.consigneeName),
    ourRef: blankToNull(v.ourRef),
    remarks: remarks.length === 0 ? null : remarks.join("\n\n"),
    items: data.items.flatMap((item, i) => {
      const dspQty = v.qty[i] ?? sumQty([]);
      return dspQty > 0 ? [{ poItemId: item.id, dspQty }] : [];
    }),
  };
}

const COLUMNS: readonly LineColumn[] = [
  { label: "Item", width: "w-14", align: "center" },
  { label: "Material", align: "left" },
  { label: "Unit", width: "w-16", align: "center" },
  { label: "Rate", width: "w-28", align: "right" },
  { label: "Ordered", width: "w-24", align: "right" },
  { label: "Dispatched", width: "w-24", align: "right" },
  { label: "Balance", width: "w-24", align: "right" },
  { label: "Dispatch Qty", width: "w-28", align: "right" },
  { label: "Value", width: "w-32", align: "right" },
];

/** Each line's value (qty × the PO rate) and their total, from the typed quantities. */
function lineValues(items: readonly Item[], qty: readonly Qty[]) {
  const values = items.map((item, i) => qtyValue(qty[i] ?? sumQty([]), item.rate));
  return { values, total: sumMoney(values) };
}

/** The header fields; the GC number and date show the DC's until typed (INV-26). */
function ChallanFields({ duplicate, onNumberTyped }: Readonly<{ duplicate: boolean; onNumberTyped(): void }>) {
  const { register, control, watch, setValue } = useFormContext<DcFormValues>();
  const [number, dcDate, gcNumber, gcDate] = watch(["number", "dcDate", "gcNumber", "gcDate"]);
  return (
    <section aria-label="Challan Details" className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 role-section-title">Challan Details</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        <FormField label="DC Number" required error={duplicate ? "Duplicate number" : undefined}>
          <Input {...register("number", { onChange: onNumberTyped })} placeholder="DC-001" autoComplete="off" />
        </FormField>
        <Controller
          control={control}
          name="dcDate"
          render={({ field }) => (
            <FormField label="DC Date" required>
              <DatePicker value={field.value} onChange={field.onChange} />
            </FormField>
          )}
        />
        <FormField label="GC Number">
          <Input value={gcNumber ?? number} onChange={(e) => setValue("gcNumber", e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="GC Date">
          <DatePicker value={gcDate ?? dcDate} onChange={(d) => setValue("gcDate", d)} />
        </FormField>
        <FormField label="Consignee" className="col-span-2">
          <Input {...register("consigneeName")} />
        </FormField>
        <FormField label="Our Ref" className="col-span-2">
          <Input {...register("ourRef")} />
        </FormField>
      </div>
    </section>
  );
}

/** The PO's items with their balances and a dispatch quantity each, with no cap (INV-32). */
function DispatchItems({ data }: { readonly data: Dispatchable | null }) {
  const { control, watch } = useFormContext<DcFormValues>();
  const qty = watch("qty");
  const items = data?.items ?? [];
  const gemc = data?.po.isGemc ?? false;
  const { values } = lineValues(items, qty);
  let empty: string | null = null;
  if (items.length === 0) empty = data ? "No dispatchable items." : "Link a PO to load items.";
  return (
    <section aria-label="Items to Dispatch" className="overflow-hidden rounded-md border border-border bg-surface">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 role-section-title">
        <span>Items to Dispatch</span>
        <span className="opacity-40">•</span>
        <span>{fmtQty(sumQty(qty))} units</span>
      </h2>
      <LineTable columns={COLUMNS} empty={empty}>
        {items.map((item, i) => (
          <tr key={item.id} className="border-b border-border/40">
            <LineCell align="center">{item.poItemNo}</LineCell>
            <LineCell title={materialTitle(item.materialCode, item.description)}>
              <MaterialCell code={item.materialCode} description={item.description} />
            </LineCell>
            <LineCell align="center">{item.unit ?? "—"}</LineCell>
            <LineCell align="right">{fmtRate(item.rate, { gemc })}</LineCell>
            <LineCell align="right">{fmtQty(item.ordQty)}</LineCell>
            <LineCell align="right">{fmtQty(item.dspQty)}</LineCell>
            <LineCell align="right">{fmtQty(item.balanceQty)}</LineCell>
            <LineCell>
              <Controller
                control={control}
                name={`qty.${i}`}
                render={({ field }) => (
                  <QuantityInput
                    value={field.value}
                    onChange={field.onChange}
                    className="text-right"
                    aria-label={`Dispatch qty of item ${item.poItemNo}`}
                  />
                )}
              />
            </LineCell>
            <LineCell align="right">{fmtMoney(values[i] ?? sumMoney([]), { gemc })}</LineCell>
          </tr>
        ))}
      </LineTable>
    </section>
  );
}

function AutoNote({ tag, children }: { readonly tag: string; readonly children: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2">
      <span className="role-metadata">{tag}</span>
      <span className="flex-1 role-metadata">{children}</span>
      <span className="role-metadata opacity-70">AUTO</span>
    </div>
  );
}

/** The GC and consignment value lines the DC prints, then the user's notes (saved as the remarks). */
function DcNotes({ total }: { readonly total: string }) {
  const { control, register, watch } = useFormContext<DcFormValues>();
  const notes = useFieldArray({ control, name: "notes" });
  const [number, dcDate, gcNumber, gcDate] = watch(["number", "dcDate", "gcNumber", "gcDate"]);
  const gcOn = gcDate ?? dcDate;
  return (
    <section aria-label="Notes / Remarks" className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 role-section-title">Notes / Remarks</h2>
      <div className="flex flex-col gap-2">
        <AutoNote tag="GC">
          {`Guarantee Certificate No. ${(gcNumber ?? number) || "—"} Dt. ${gcOn === "" ? "—" : fmtDate(gcOn)}`}
        </AutoNote>
        <AutoNote tag="VAL">{`Consignment value of BHEL PO: ${total}`}</AutoNote>
        {notes.fields.map((note, i) => (
          <div key={note.id} className="flex gap-2">
            <Input {...register(`notes.${i}.text`)} placeholder={`Note ${i + 1}`} aria-label={`Note ${i + 1}`} />
            <Button variant="ghost" size="sm" className="text-error" onClick={() => notes.remove(i)}>
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button variant="outline" size="sm" onClick={() => notes.append({ text: "" })}>
            Add Note
          </Button>
        </div>
      </div>
    </section>
  );
}

function Subtitle({ data, total }: { readonly data: Dispatchable | null; readonly total: string }) {
  if (data === null) return <span className="role-metadata">Link a PO to begin</span>;
  return (
    <span>
      PO:{" "}
      <Link to="/po/$id" params={{ id: data.po.id }} className="role-reference-link">
        {data.po.poNumber}
      </Link>{" "}
      • {fmtCount(data.items.length)} items • Total: {total}
    </span>
  );
}

const defaultsOf = (data: Dispatchable | null): DcFormValues => ({
  number: "",
  dcDate: todayIst(),
  gcNumber: null,
  gcDate: null,
  consigneeName: data?.defaults.consigneeName ?? "",
  ourRef: data?.defaults.ourRef ?? "",
  qty: (data?.items ?? []).map(() => sumQty([])),
  notes: [],
});

/** The form over a linked PO's dispatchable items; `data` is null until a PO is linked. */
function DCFormView({ data }: { readonly data: Dispatchable | null }) {
  const navigate = useNavigate();
  const router = useRouter();
  const invalidate = useInvalidate();
  const form = useForm<DcFormValues>({ defaultValues: defaultsOf(data) });
  const [number, dcDate, qty] = form.watch(["number", "dcDate", "qty"]);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const check = useNumberCheck("dc.numberCheck", number, dcDate);
  // The number the API refused stays marked until it is changed.
  const duplicate = check.taken || (refused !== null && refused === number.trim());
  const total = fmtMoney(lineValues(data?.items ?? [], qty).total, { gemc: data?.po.isGemc ?? false });

  function submit() {
    if (data === null) return;
    const body = dcCreateBody(data, form.getValues());
    setError("error" in body ? body.error : null);
    if (!("error" in body)) setConfirming(true);
  }

  async function save() {
    const body = data && dcCreateBody(data, form.getValues());
    if (!body || "error" in body) return;
    setSaving(true);
    try {
      const dc = await api.request("dc.create", { body });
      // Leave first: the refetches (the source page, the number check) need not hold the navigation.
      void navigate({ to: "/dc/$id", params: { id: dc.id } });
      void invalidate("dc", "po");
    } catch (e) {
      // A taken `(number, FY)` is a 409 that names both (INV-22).
      if (e instanceof ApiError && e.status === 409) setRefused(body.number);
      setError(e instanceof Error ? e.message : "Failed to create Delivery Challan");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Create Delivery Challan"
          onBack={() => router.history.back()}
          subtitle={<Subtitle data={data} total={total} />}
          action={
            <>
              {data === null && (
                <DocPicker
                  types={["po"]}
                  placeholder="Search PO..."
                  onLink={(hit) => void navigate({ to: "/dc/create", search: { po: hit.id } })}
                />
              )}
              <Button variant="outline" size="sm" onClick={() => router.history.back()} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submit}
                loading={saving}
                disabled={data === null || duplicate || check.checking || number.trim() === ""}
              >
                <Save aria-hidden />
                {saving ? "Saving..." : "Save DC"}
              </Button>
            </>
          }
        />
        <FormAlert message={error} />
        <ChallanFields duplicate={duplicate} onNumberTyped={() => setRefused(null)} />
        <DispatchItems data={data} />
        <DcNotes total={total} />
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => void save()}
          loading={saving}
          title="Confirm Challan Generation"
          warningText="This will deduct quantities from the PO balance. Ensure details are correct."
          confirmLabel="Generate DC"
          variant="warning"
        />
      </div>
    </FormProvider>
  );
}

/** `/dc/create` (SPEC-18 §2): link a PO, type the DC number (no suggestion, INV-27) and dispatch any `qty > 0`. */
export function DCForm({ poId }: { readonly poId?: string | undefined }) {
  const dispatchable = useQuery({
    ...apiQuery("dc.dispatchable", { params: { poId: poId ?? "" } }),
    enabled: poId !== undefined,
  });
  if (poId === undefined) return <DCFormView data={null} />;
  if (!dispatchable.data) return <QueryState error={dispatchable.error} />;
  return <DCFormView key={poId} data={dispatchable.data} />;
}
