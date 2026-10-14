// First-run onboarding (INV-78): public, and answered only while no supplier exists.
import type { Handlers } from "../app.ts";
import type { Services } from "../services/index.ts";

export function onboardingRoutes({
  onboarding,
}: Pick<Services, "onboarding">): Required<Pick<Handlers, "onboarding.status" | "onboarding.complete">> {
  return {
    "onboarding.status": async () => ({ required: !(await onboarding.done()) }),
    "onboarding.complete": ({ body }) => onboarding.complete(body),
  };
}
