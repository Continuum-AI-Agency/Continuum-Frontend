import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_BRAND_GUIDELINE_FORM,
  brandGuidelineApprovalSchema,
  brandGuidelineDraftSchema,
} from "./brandGuidelines";

function buildDraft() {
  return {
    ...EMPTY_BRAND_GUIDELINE_FORM,
    purpose: "Winter launch",
    colors: {
      primary: "#1A1A1A",
      secondary: "#FFFFFF",
      accent: "#4F46E5",
      neutral: "#0F172A",
    },
  };
}

function buildApproved() {
  return {
    ...buildDraft(),
    logo: {
      usageGuidelines: "Use on light backgrounds only.",
      clearSpace: "Maintain 8px clear space.",
      misuse: "Do not stretch or skew.",
    },
    typography: {
      headingFont: "Space Grotesk",
      bodyFont: "Inter",
      accentFont: "",
      usageGuidelines: "Headings in bold, body in regular weight.",
    },
    stationery: {
      overview: "Clean, minimal print collateral.",
      applications: "Business cards, letterheads, envelopes.",
    },
    styleDesign: {
      visualDirection: "Crisp layouts with generous spacing.",
      imageryGuidance: "High-contrast, lifestyle photography.",
    },
    verbalIdentity: {
      audiencePersona: "Mid-market marketing teams.",
      story: "We help teams move faster with clarity.",
      values: "Craft, clarity, performance.",
      vision: "A world where brands move at the speed of thought.",
      mission: "Give teams a unified brand system.",
      message: "Operate with brand clarity across channels.",
      toneOfVoice: "Confident, grounded, optimistic.",
      channelGuidelines: "Direct and concise for social, longer form for blog.",
    },
    tags: {
      logo: [
        { label: "minimal", description: "Logo is clean and minimal." },
        { label: "bold", description: "Logo presence is bold." },
        { label: "geometric", description: "Geometric construction." },
      ],
      typography: [
        { label: "modern", description: "Modern sans-serif pairing." },
        { label: "open", description: "Open letterforms." },
        { label: "sharp", description: "Sharp headline presence." },
      ],
      stationery: [
        { label: "clean", description: "Clean layouts." },
        { label: "premium", description: "Premium stock guidance." },
        { label: "minimal", description: "Minimal print treatment." },
      ],
      style_design: [
        { label: "contrast", description: "High contrast visuals." },
        { label: "structured", description: "Structured grid system." },
        { label: "glow", description: "Subtle brand glow accents." },
      ],
      verbal_identity: [
        { label: "direct", description: "Direct, clear statements." },
        { label: "confident", description: "Confident messaging." },
        { label: "human", description: "Human, approachable tone." },
      ],
    },
  };
}

describe("brandGuidelineDraftSchema", () => {
  test("accepts valid draft payload", () => {
    const parsed = brandGuidelineDraftSchema.safeParse(buildDraft());
    assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
  });

  test("rejects invalid hex colors", () => {
    const payload = buildDraft();
    payload.colors.primary = "red";
    const parsed = brandGuidelineDraftSchema.safeParse(payload);
    assert.ok(!parsed.success);
  });
});

describe("brandGuidelineApprovalSchema", () => {
  test("accepts full approval payload", () => {
    const parsed = brandGuidelineApprovalSchema.safeParse(buildApproved());
    assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
  });

  test("rejects missing required tags", () => {
    const payload = buildApproved();
    payload.tags.logo = payload.tags.logo.slice(0, 2);
    const parsed = brandGuidelineApprovalSchema.safeParse(payload);
    assert.ok(!parsed.success);
  });
});
