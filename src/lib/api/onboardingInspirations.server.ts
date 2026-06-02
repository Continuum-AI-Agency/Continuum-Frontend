"use server";

import "server-only";
import { httpServer } from "@/lib/api/http.server";
import type { OnboardingBrandKitRequest } from "@continuum/contracts";

// Fire-and-forget warm: kicks competitor discovery on the Backend so the list is
// likely cached by the time the user reaches the inspirations screen. The Backend
// dedupes against the on-demand run, so calling this is purely an optimization.
export async function warmOnboardingCompetitorsServer(brandId: string): Promise<void> {
  await httpServer.request({
    path: "/api/onboarding/inspirations/competitors/refresh",
    method: "POST",
    body: { brandId },
    cache: "no-store",
  });
}

// Persists the deterministic brand kit (colors/typography columns + logo +
// brand-kit.json). Runs regardless of the inspirations flag.
export async function persistBrandKitServer(input: OnboardingBrandKitRequest): Promise<void> {
  await httpServer.request({
    path: "/api/onboarding/brand-kit",
    method: "POST",
    body: input,
    cache: "no-store",
  });
}
