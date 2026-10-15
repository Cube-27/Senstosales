// Settings (SPEC-15 PR 3, INV-72): the legacy sections. The supplier profile, GST rates and System Defaults save
// only through Save, which says why it is disabled; leaving with unsaved changes asks first. The form is derived from
// the server value (§4.1). Every section stays mounted and only the chosen one shows, so switching keeps edits and
// moves nothing above it; messages have reserved slots (C8).
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type FieldErrors, FormProvider, useForm } from "react-hook-form";

import { serverErrors, showServerErrors } from "../../../lib/form-errors.ts";
import { Button, ButtonGroup, ConfirmDialog, PageHeader, useToast } from "../../common/index.ts";
import { BuyersSection } from "./BuyersSection.tsx";
import {
  settingsBody,
  type SettingsFormInput,
  type SettingsFormOutput,
  SUPPLIER_SERVER_FIELDS,
  supplierBody,
  toForm,
  zSettingsForm,
} from "./profile.ts";
import { SupplierProfileFields } from "./ProfileFields.tsx";
import { SystemAccessPanel } from "./SystemAccessPanel.tsx";
import { SystemDefaultsFields } from "./SystemDefaultsFields.tsx";
import { settingsQuery, supplierQuery, useSaveSettings } from "./useSettings.ts";

type Section = "supplier" | "buyers" | "system";

const SECTIONS = [
  { id: "supplier", label: "Supplier Profile" },
  { id: "buyers", label: "Buyer Management" },
  { id: "system", label: "System Defaults" },
] as const satisfies ReadonlyArray<{ id: Section; label: string }>;

/** The API's field paths as the form's. */
const SERVER_FIELDS = {
  ...SUPPLIER_SERVER_FIELDS,
  "preferences.igst_pct": "defaults.igstPct",
} as const;

/** Why Save is disabled, or null when it is enabled. */
function saveBlockedBy(state: {
  loaded: boolean;
  isDirty: boolean;
  errors: FieldErrors<SettingsFormInput>;
}): string | null {
  if (!state.loaded) return "Loading settings";
  if (state.errors.supplier) return "Fix the highlighted fields in Supplier Profile";
  if (state.errors.rates || state.errors.defaults) return "Fix the highlighted fields in System Defaults";
  return state.isDirty ? null : "No changes to save";
}

export function SettingsScreen() {
  const [section, setSection] = useState<Section>("supplier");
  const supplier = useQuery(supplierQuery);
  const settings = useQuery(settingsQuery);
  const loaded = supplier.data !== undefined && settings.data !== undefined;
  const values = useMemo(
    () => (supplier.data && settings.data ? toForm(supplier.data, settings.data) : undefined),
    [supplier.data, settings.data],
  );
  const form = useForm<SettingsFormInput, unknown, SettingsFormOutput>({
    resolver: zodResolver(zSettingsForm),
    mode: "onChange",
    ...(values ? { values } : {}),
    resetOptions: { keepDirtyValues: true },
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  const save = useSaveSettings();
  const { toast } = useToast();

  const blocker = useBlocker({ shouldBlockFn: () => isDirty, enableBeforeUnload: () => isDirty, withResolver: true });

  const submit = form.handleSubmit(async (values) => {
    if (!supplier.data || !settings.data) return;
    const { dirtyFields } = form.formState;
    const { id: _id, ...stored } = supplier.data;
    try {
      await save.mutateAsync({
        supplier: dirtyFields.supplier ? supplierBody(stored, values.supplier) : null,
        settings: dirtyFields.rates || dirtyFields.defaults ? settingsBody(settings.data, values) : null,
      });
    } catch (error) {
      showServerErrors(form.setError, error, SERVER_FIELDS);
      return;
    }
    form.reset(form.getValues());
    toast("Success", "All settings saved successfully", "success");
  });

  const reload = async (): Promise<void> => {
    const [s, t] = await Promise.all([supplier.refetch(), settings.refetch()]);
    if (s.data && t.data) form.reset(toForm(s.data, t.data));
  };

  const blockedBy = saveBlockedBy({ loaded, isDirty, errors });
  const loadError = supplier.error ?? settings.error;
  const footer = errors.root?.message ?? (loadError ? "Settings could not be loaded." : undefined);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Settings & Master Data"
        subtitle="Configure organization identity, buyer relationships, and system defaults"
        action={
          <>
            <span id="save-reason" aria-live="polite" className="w-72 truncate text-right role-helper-text">
              {blockedBy ?? ""}
            </span>
            <Button
              type="submit"
              form="settings-form"
              disabled={blockedBy !== null}
              loading={isSubmitting}
              aria-describedby="save-reason"
            >
              Save
            </Button>
          </>
        }
      />

      <ButtonGroup label="Settings sections" options={SECTIONS} value={section} onChange={setSection} />

      <div className="min-h-[400px] rounded-lg border border-border/70 bg-surface">
        {loaded ? (
          <>
            <FormProvider {...form}>
              <form id="settings-form" onSubmit={(e) => void submit(e)} noValidate>
                <div hidden={section !== "supplier"} className="p-4">
                  <SupplierProfileFields />
                </div>
                <div hidden={section !== "system"} className="p-4 pb-0">
                  <SystemDefaultsFields />
                </div>
              </form>
            </FormProvider>
            {/* Outside the Save form: these write on their own buttons, as legacy. */}
            <div hidden={section !== "system"} className="p-4">
              <SystemAccessPanel />
            </div>
            <div hidden={section !== "buyers"} className="p-4">
              <BuyersSection />
            </div>
          </>
        ) : (
          <div className="flex h-[400px] items-center justify-center role-section-title">
            {loadError ? "Settings could not be loaded." : "Initializing System..."}
          </div>
        )}
      </div>

      <div className="flex min-h-8 items-center gap-3">
        <p role="alert" className="truncate text-error role-helper-text">
          {footer}
        </p>
        {(save.error && serverErrors(save.error).conflict) || loadError ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            Reload
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={blocker.status === "blocked"}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Unsaved changes"
        warningText="Your settings changes are not saved. Leave this page and lose them?"
        confirmLabel="Leave"
        cancelLabel="Stay"
      />
    </div>
  );
}
