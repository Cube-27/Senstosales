import { createFileRoute } from "@tanstack/react-router";

import { OnboardingScreen } from "../components/modules/onboarding/OnboardingScreen.tsx";

export const Route = createFileRoute("/onboarding")({ component: OnboardingScreen });
