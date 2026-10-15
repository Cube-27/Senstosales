// Legacy Buyer Management (INV-86): the BHEL units as cards, an editor for a new or chosen buyer that saves on its
// own Save, and delete after a confirmation. A buyer here is its unit name, GSTIN and state (ARCHITECTURE §8.2);
// the legacy billing address and default flag have no column (EC-57).
import { zodResolver } from "@hookform/resolvers/zod";
import type { RouteOutput } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import { showServerErrors } from "../../../lib/form-errors.ts";
import { Building, Check, Pencil, Plus, Trash2, Users, X } from "../../../lib/icons.ts";
import { Button, ConfirmDialog, useToast } from "../../common/index.ts";
import { FormRootError, TextField } from "./ProfileFields.tsx";
import { buyersQuery, useDeleteBuyer, useSaveBuyer } from "./useSettings.ts";

type Buyer = RouteOutput<"buyers.list">[number];

/** Legacy rule: a buyer needs its name and GSTIN. */
const zBuyerForm = z.object({
  unitName: z.string().trim().min(1, "Name and GSTIN are required"),
  gstin: z.string().trim().min(1, "Name and GSTIN are required"),
  state: z.string(),
});

/** The buyer being edited: a stored one, or a new one (`id` null). */
type Editing = {
  readonly id: string | null;
  readonly stateCode: string | null;
  readonly values: z.input<typeof zBuyerForm>;
};

const NEW: Editing = { id: null, stateCode: null, values: { unitName: "", gstin: "", state: "" } };

export function BuyersSection() {
  const { data: buyers } = useQuery(buyersQuery);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Buyer | null>(null);
  const remove = useDeleteBuyer();
  const { toast } = useToast();

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast("Success", "Buyer deleted", "success");
    } catch {
      toast("Error", "Failed to delete buyer", "error");
    }
    setDeleting(null);
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button type="button" size="sm" onClick={() => setEditing(NEW)}>
          <Plus className="size-4" />
          Add Buyer
        </Button>
      </div>

      {editing && <BuyerEditor key={editing.id ?? "new"} editing={editing} onClose={() => setEditing(null)} />}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {buyers && buyers.length > 0 ? (
          buyers.map((buyer) => (
            <BuyerCard
              key={buyer.id}
              buyer={buyer}
              onEdit={() =>
                setEditing({
                  id: buyer.id,
                  stateCode: buyer.stateCode,
                  values: { unitName: buyer.unitName, gstin: buyer.gstin ?? "", state: buyer.state ?? "" },
                })
              }
              onDelete={() => setDeleting(buyer)}
            />
          ))
        ) : (
          <div className="col-span-1 rounded-lg border border-border/70 bg-surface-sunken p-8 text-center md:col-span-2">
            <Users className="mx-auto mb-2 size-6 text-tertiary opacity-30" />
            <p className="role-metadata">{buyers ? "No Buyers Found" : ""}</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete buyer"
        warningText="Are you sure you want to delete this buyer?"
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

function BuyerCard({
  buyer,
  onEdit,
  onDelete,
}: {
  readonly buyer: Buyer;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-3">
      <div className="flex items-center gap-2">
        <div className="rounded bg-primary/10 p-1.5 text-accent">
          <Building className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate role-table-cell">{buyer.unitName}</p>
          <p className="truncate role-metadata">{buyer.gstin}</p>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
        <span className="truncate role-metadata">{buyer.state ?? ""}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Edit buyer">
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete buyer"
            className="text-tertiary hover:text-error"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function BuyerEditor({ editing, onClose }: { readonly editing: Editing; readonly onClose: () => void }) {
  const save = useSaveBuyer();
  const { toast } = useToast();
  const form = useForm({ resolver: zodResolver(zBuyerForm), defaultValues: editing.values });

  const submit = form.handleSubmit(async ({ unitName, gstin, state }) => {
    const body = { unitName, gstin, state: state.trim() === "" ? null : state, stateCode: editing.stateCode };
    try {
      await save.mutateAsync({ id: editing.id, body });
    } catch (error) {
      showServerErrors(form.setError, error, { unitName: "unitName", gstin: "gstin", state: "state" });
      return;
    }
    toast("Success", editing.id ? "Updated" : "Created", "success");
    onClose();
  });

  return (
    <FormProvider {...form}>
      <form
        className="mb-3 rounded-lg border border-border/70 bg-surface-sunken/50 p-4"
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Building className="size-4 text-accent" />
            <span className="role-section-title">{editing.id ? "Edit Buyer Profile" : "New Buyer Profile"}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close editor">
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-x-3 md:grid-cols-3">
          <TextField name="unitName" label="Buyer Name" placeholder="e.g. BHEL Trichy" />
          <TextField name="gstin" label="Buyer GSTIN" placeholder="15-character GSTIN" />
          <TextField name="state" label="Place of Supply" placeholder="Tamil Nadu" />
        </div>
        <FormRootError />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
            <Check className="size-4" />
            Save
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
