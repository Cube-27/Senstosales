import type { Qty } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { fmtQty } from "@senstosales/schemas";
import { useState } from "react";

import { api, useInvalidate } from "../../../lib/api.ts";
import { AlertTriangle, Edit } from "../../../lib/icons.ts";
import {
  Button,
  FormField,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  QuantityInput,
} from "../../common/index.ts";

type Item = RouteOutput<"po.detail">["items"][number];

export interface ManualQtyCellProps {
  readonly poId: string;
  readonly item: Item;
  /** A DC was created on the item after its manual quantity was set (`MANUAL_ADJUSTMENT_OVERLAP`, INV-57). */
  readonly overlap: boolean;
}

/** The manual-quantity button's tooltip: the quantity and its note, or what the button does. */
function manualTitle(item: Item): string {
  if (item.manualDispatchedQty <= 0) return "Set a manual dispatched quantity";
  const note = item.manualNote ? `: ${item.manualNote}` : "";
  return `Manual ${fmtQty(item.manualDispatchedQty)}${note}`;
}

/**
 * The item's Dispatched with the inline manual dispatched quantity and note (A-15, INV-08), where the legacy lot
 * override was edited. The editor opens over the row, so editing moves nothing (C8); saving recomputes the item and
 * the screen shows the new Dispatched and Pending from the server.
 */
export function ManualQtyCell({ poId, item, overlap }: ManualQtyCellProps) {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Qty>(item.manualDispatchedQty);
  const [note, setNote] = useState(item.manualNote ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  function toggle(next: boolean) {
    if (next) {
      setQty(item.manualDispatchedQty);
      setNote(item.manualNote ?? "");
      setError(undefined);
    }
    setOpen(next);
  }

  async function save() {
    setSaving(true);
    try {
      await api.request("po.setManualDispatched", {
        params: { id: poId, itemId: item.id },
        body: { qty, ...(note.trim() === "" ? {} : { note: note.trim() }) },
      });
      await invalidate("po");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums">
      {overlap && (
        <AlertTriangle
          className="size-3.5 text-warning"
          aria-label="A delivery challan was created after the manual quantity was set"
        />
      )}
      {fmtQty(item.dspQty)}
      <Popover open={open} onOpenChange={toggle}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Manual dispatched quantity for item ${item.poItemNo}`}
            title={manualTitle(item)}
          >
            <Edit className="size-3.5" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <FormField label="Manual dispatched qty" help="Added to the dispatched quantity." error={error}>
              <QuantityInput value={qty} onChange={setQty} className="text-right" />
            </FormField>
            <FormField label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={saving}>
                Save
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </span>
  );
}
