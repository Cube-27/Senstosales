import type { Qty } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { fmtQty } from "@senstosales/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../../lib/api.ts";
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

/**
 * The item's Dispatched with the inline manual dispatched quantity and note (A-15, INV-08), where the legacy lot
 * override was edited. The editor opens over the row, so editing moves nothing (C8); saving recomputes the item and
 * the screen shows the new Dispatched and Pending from the server.
 */
export function ManualQtyCell({ poId, item, overlap }: ManualQtyCellProps) {
  const queryClient = useQueryClient();
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
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("po.") });
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
            title={
              item.manualDispatchedQty > 0
                ? `Manual ${fmtQty(item.manualDispatchedQty)}${item.manualNote ? `: ${item.manualNote}` : ""}`
                : "Set a manual dispatched quantity"
            }
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
