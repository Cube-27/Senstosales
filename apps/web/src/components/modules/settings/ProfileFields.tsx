// The fields onboarding and settings share (SPEC-15 §2: onboarding uses the existing settings layout, same fields
// and order). Both read the form through react-hook-form's context; each field shows its error in place (C8).
import { type FieldPath, type FieldValues, get, useFormContext } from "react-hook-form";

import { cn } from "../../../lib/cn.ts";
import { FormField, Input } from "../../common/index.ts";

type Path = FieldPath<FieldValues>;

/** One text field bound to the form at `name`, with its validation error. */
export function TextField({
  name,
  label,
  placeholder,
  className = "",
  type = "text",
  input,
}: {
  readonly name: Path;
  readonly label: string;
  readonly placeholder?: string;
  readonly className?: string;
  readonly type?: "text" | "password";
  /** Extra props for the input itself. */
  readonly input?: { readonly inputMode: "decimal"; readonly className: string };
}) {
  const { register, formState } = useFormContext();
  const error: { message?: string } | undefined = get(formState.errors, name);
  return (
    <FormField label={label} error={error?.message} className={className}>
      <Input type={type} placeholder={placeholder} {...input} {...register(name)} />
    </FormField>
  );
}

/** A percentage field: decimal text, centred tabular figures as the legacy rate inputs. */
export function RateField({ name, label }: { readonly name: Path; readonly label: string }) {
  return <TextField name={name} label={label} input={RATE_INPUT} />;
}

const RATE_INPUT = { inputMode: "decimal", className: "text-center tabular-nums" } as const;

/** The form's message for a refused write that no field took (`errors.root`), in a slot that is always there (C8). */
export function FormRootError({ className = "" }: { readonly className?: string }) {
  const { formState } = useFormContext();
  return (
    <p role="alert" className={cn("min-h-4 text-error role-helper-text", className)}>
      {formState.errors.root?.message}
    </p>
  );
}

/** The legacy Supplier Profile section's fields, in its order (three columns). */
export function SupplierProfileFields() {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 md:grid-cols-3">
      <TextField name="supplier.name" label="Registered Entity Name" placeholder="e.g. Acme Industries Ltd." />
      <TextField name="supplier.contact" label="Phone Number" placeholder="+91 98765 43210" />
      <TextField name="supplier.email" label="Primary Email" placeholder="billing@company.com" />
      <TextField name="supplier.gstin" label="GSTIN (Tax ID)" placeholder="15-character GSTIN" />
      <TextField name="supplier.address" label="Registered Address" placeholder="Full registered address..." />
      <TextField
        name="supplier.description"
        label="Business Tagline / GC Header"
        placeholder="e.g. Manufacturers & Suppliers of Fibre Glass Products..."
      />
      <TextField name="supplier.state" label="State" placeholder="e.g. Example State" />
      <TextField name="supplier.stateCode" label="State Code" placeholder="e.g. 00" />
      <TextField name="supplier.jurisdiction" label="Jurisdiction (City)" placeholder="e.g. EXAMPLE CITY" />
      <TextField name="supplier.placeOfSupply" label="Place of Supply" placeholder="e.g. Example City" />
      <TextField name="supplier.hsn" label="Default HSN" placeholder="e.g. 0000" />
    </div>
  );
}
