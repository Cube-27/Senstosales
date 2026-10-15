// First run (SPEC-15 PR 2, A-6, INV-78): with no supplier the app opens here. The supplier profile and the two GST
// rates, in the settings layout, create the supplier in one write; then the login.
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";

import { api } from "../../../lib/api.ts";
import { showServerErrors } from "../../../lib/form-errors.ts";
import { onboardingQuery } from "../../../lib/session.ts";
import { Button } from "../../common/index.ts";
import {
  EMPTY_ONBOARDING,
  onboardingBody,
  type OnboardingFormInput,
  type OnboardingFormOutput,
  zOnboardingForm,
} from "../settings/profile.ts";
import { RateField, SupplierProfileFields } from "../settings/ProfileFields.tsx";

export function OnboardingScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<OnboardingFormInput, unknown, OnboardingFormOutput>({
    resolver: zodResolver(zOnboardingForm),
    defaultValues: EMPTY_ONBOARDING,
  });
  const complete = useMutation({
    mutationFn: (values: OnboardingFormOutput) => api.request("onboarding.complete", { body: onboardingBody(values) }),
    onSuccess: () => queryClient.setQueryData(onboardingQuery.queryKey, { required: false }),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await complete.mutateAsync(values);
    } catch (error) {
      showServerErrors(form.setError, error, SERVER_FIELDS);
      return;
    }
    await navigate({ to: "/auth/login", replace: true });
  });

  return (
    <div data-auth-screen="true" className="flex min-h-screen justify-center px-4 pt-[8vh] pb-10">
      <div className="h-fit w-full max-w-4xl rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="role-page-title">Welcome</h1>
          <p className="role-page-subtitle">
            Enter your company details and GST rates to get started. You can change them later in Settings.
          </p>
        </div>
        <FormProvider {...form}>
          <form onSubmit={(e) => void submit(e)} noValidate>
            <section aria-labelledby="onboarding-profile" className="rounded-lg border border-border/70 p-4">
              <h2 id="onboarding-profile" className="mb-3 role-section-title">
                Supplier Profile
              </h2>
              <SupplierProfileFields />
            </section>
            <section aria-labelledby="onboarding-rates" className="mt-4 rounded-lg border border-border/70 p-4">
              <h2 id="onboarding-rates" className="mb-3 role-section-title">
                GST Rates
              </h2>
              <div className="grid max-w-md grid-cols-2 gap-2">
                <RateField name="rates.cgstPct" label="CGST %" />
                <RateField name="rates.sgstPct" label="SGST %" />
              </div>
            </section>
            <div className="mt-4 flex items-center justify-end gap-3">
              <p role="alert" className="min-h-5 flex-1 truncate text-error role-helper-text">
                {form.formState.errors.root?.message}
              </p>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Save and Continue
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}

/** The onboarding body's fields as the form's (the letterhead description is `invoiceDefaults.description`). */
const SERVER_FIELDS = {
  name: "supplier.name",
  contact: "supplier.contact",
  email: "supplier.email",
  gstin: "supplier.gstin",
  address: "supplier.address",
  "invoiceDefaults.description": "supplier.description",
  cgstPct: "rates.cgstPct",
  sgstPct: "rates.sgstPct",
} as const;
