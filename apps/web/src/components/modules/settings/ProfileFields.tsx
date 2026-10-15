// The fields onboarding and settings share (SPEC-15 §2: onboarding uses the existing settings layout, same fields
// and order). Both read the form through react-hook-form's context; each field shows its error in place (C8).
import { type FieldPath, type FieldValues, get, useFormContext } from "react-hook-form";

import { FormField, Input } from "../../common/index.ts";

type Path = FieldPath<FieldValues>;

/** One text field bound to the form at `name`, with its validation error. */
export function TextField({
  name,
  label,
  placeholder,
  className = "",
  type = "text",
}: {
  readonly name: Path;
  readonly label: string;
  readonly placeholder?: string;
  readonly className?: string;
  readonly type?: "text" | "password";
}) {
  const { register, formState } = useFormContext();
  const error: { message?: string } | undefined = get(formState.errors, name);
  return (
    <FormField label={label} error={error?.message} className={className}>
      <Input type={type} placeholder={placeholder} {...register(name)} />
    </FormField>
  );
}

/** A percentage field: decimal text, centred tabular figures as the legacy rate inputs. */
export function RateField({ name, label }: { readonly name: Path; readonly label: string }) {
  const { register, formState } = useFormContext();
  const error: { message?: string } | undefined = get(formState.errors, name);
  return (
    <FormField label={label} error={error?.message}>
      <Input inputMode="decimal" className="text-center tabular-nums" {...register(name)} />
    </FormField>
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
    </div>
  );
}
