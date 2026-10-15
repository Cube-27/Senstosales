// The legacy System Defaults cards: Fiscal Year Cycle, and the IGST/CGST/SGST rates. Part of the Save form; CGST and
// SGST are the rates copied onto invoices (A2-4), the rest are stored preferences. Base Currency is gone (owner
// answer 18).
import { Controller, useFormContext } from "react-hook-form";

import { FormField, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../common/index.ts";
import { FY_CYCLE_LABELS, type SettingsFormInput } from "./profile.ts";
import { RateField } from "./ProfileFields.tsx";

function ChoiceField({
  name,
  label,
  options,
}: {
  readonly name: "defaults.fyCycle";
  readonly label: string;
  readonly options: Readonly<Record<string, string>>;
}) {
  const { control } = useFormContext<SettingsFormInput>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormField label={label}>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger onBlur={field.onBlur}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(options).map(([id, text]) => (
                <SelectItem key={id} value={id}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
    />
  );
}

export function SystemDefaultsFields() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-border/70 bg-surface p-4">
        <ChoiceField name="defaults.fyCycle" label="Fiscal Year Cycle" options={FY_CYCLE_LABELS} />
      </div>
      <div className="rounded-lg border border-border/70 bg-surface p-4">
        <div className="grid grid-cols-3 gap-2">
          <RateField name="defaults.igstPct" label="IGST %" />
          <RateField name="rates.cgstPct" label="CGST %" />
          <RateField name="rates.sgstPct" label="SGST %" />
        </div>
      </div>
    </div>
  );
}
