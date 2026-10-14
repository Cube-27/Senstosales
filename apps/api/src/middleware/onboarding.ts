// The onboarding gate (INV-78, ARCHITECTURE §10.3): until the supplier exists, a route that is not public answers
// 409 `onboarding-required`. It runs before the session check, since first run has nobody signed in yet.
import { onboardingRequired } from "../errors.ts";

export async function requireOnboarded(onboarded: () => Promise<boolean>): Promise<void> {
  if (!(await onboarded())) throw onboardingRequired();
}
