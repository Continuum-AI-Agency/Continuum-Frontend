"use client";

import posthog from "posthog-js";

type EventProps = Record<string, string | number | boolean | null | undefined>;

export type OnboardingEventName =
  | "onboarding_step_viewed"
  | "onboarding_scrape_started"
  | "onboarding_scrape_completed"
  | "onboarding_scrape_failed"
  | "onboarding_agent_preview_started"
  | "onboarding_agent_preview_completed"
  | "onboarding_agent_preview_failed"
  | "onboarding_reveal_cache_hit"
  | "onboarding_reveal_cache_miss"
  | "onboarding_oauth_started"
  | "onboarding_oauth_completed"
  | "onboarding_oauth_failed"
  | "onboarding_asset_assigned"
  | "onboarding_asset_unassigned"
  | "onboarding_assets_cleared"
  | "onboarding_member_invited"
  | "onboarding_launch_clicked"
  | "onboarding_inspirations_skipped"
  | "onboarding_launch_succeeded"
  | "onboarding_launch_failed"
  | "onboarding_trends_prewarm_failed"
  | "onboarding_preview_recovered_via_status"
  | "onboarding_preview_reconnected_via_status";

export function trackOnboardingEvent(event: OnboardingEventName, props?: EventProps): void {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, props);
  } catch (error) {
    console.warn("[onboarding-telemetry] capture failed", event, error);
  }
}

export function timing(): { sinceStart: () => number } {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    sinceStart: () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      return Math.round(now - start);
    },
  };
}
