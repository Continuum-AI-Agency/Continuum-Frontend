import { describe, expect, it } from "bun:test";

import type {
  AgentRequestPayload,
  OnboardingPreviewEvent,
} from "@/lib/onboarding/agentClient";
import {
  brandBookGenerationStatus,
  brandBookSectionLabel,
  canGenerateBrandBook,
} from "./brandBookGeneration";

function payload(overrides?: {
  brandId?: string;
  brandName?: string;
  userId?: string;
}): AgentRequestPayload {
  return {
    brandProfile: {
      id: overrides?.brandId ?? "brand-1",
      brand_name: overrides?.brandName ?? "Pizza Test",
    },
    runContext: {
      user_id: overrides?.userId ?? "user-1",
      brand_id: overrides?.brandId ?? "brand-1",
      brand_name: overrides?.brandName ?? "Pizza Test",
      created_at: "2026-06-24T00:00:00.000Z",
      platform_urls: [],
      integrated_platforms: [],
      brand_voice_tags: [],
      integration_account_ids: [],
    },
  };
}

describe("brandBookGenerationStatus", () => {
  it("announces the run starting", () => {
    expect(brandBookGenerationStatus({ type: "run", runId: "r1", reused: false })).toBe(
      "Starting analysis…",
    );
  });

  it("names the section being analyzed while it is running", () => {
    const event: OnboardingPreviewEvent = {
      type: "status",
      section: "website",
      status: "running",
    };
    expect(brandBookGenerationStatus(event)).toBe("Analyzing website…");
  });

  it("ignores non-running section statuses (done/skipped/error)", () => {
    for (const status of ["done", "skipped", "error"] as const) {
      expect(
        brandBookGenerationStatus({ type: "status", section: "voice", status }),
      ).toBeNull();
    }
  });

  it("shows a finalizing line on a successful complete", () => {
    expect(brandBookGenerationStatus({ type: "complete", status: "ok" })).toBe(
      "Finalizing your Brand Book…",
    );
    expect(brandBookGenerationStatus({ type: "complete", status: "partial" })).toBe(
      "Finalizing your Brand Book…",
    );
  });

  it("returns null for a failed complete (handled via toast, not the status line)", () => {
    expect(brandBookGenerationStatus({ type: "complete", status: "error" })).toBeNull();
  });

  it("returns null for noisy events (stream deltas, pings, errors)", () => {
    expect(
      brandBookGenerationStatus({ type: "stream", section: "voice", delta: "x" }),
    ).toBeNull();
    expect(brandBookGenerationStatus({ type: "ping" })).toBeNull();
    expect(brandBookGenerationStatus({ type: "error", message: "boom" })).toBeNull();
  });
});

describe("brandBookSectionLabel", () => {
  it("maps known sections to friendly labels", () => {
    expect(brandBookSectionLabel("first_impression")).toBe("first impression");
    expect(brandBookSectionLabel("business")).toBe("business model");
  });
});

describe("canGenerateBrandBook", () => {
  it("accepts a payload with a brand id, brand name and user", () => {
    expect(canGenerateBrandBook(payload())).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(canGenerateBrandBook(null)).toBe(false);
    expect(canGenerateBrandBook(undefined)).toBe(false);
  });

  it("rejects a missing brand id", () => {
    expect(canGenerateBrandBook(payload({ brandId: "" }))).toBe(false);
  });

  it("rejects a missing user id", () => {
    expect(canGenerateBrandBook(payload({ userId: "" }))).toBe(false);
  });

  it("rejects a blank brand name", () => {
    expect(canGenerateBrandBook(payload({ brandName: "" }))).toBe(false);
  });
});
