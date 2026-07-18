import { describe, expect, it } from "bun:test";

import {
  creativeSkillDraftSchema,
  creativeSkillSelectionSchema,
} from "./creative-skill-draft";

const validSelection = {
  brandId: "brand-1",
  nodes: [
    {
      nodeType: "nanoGen",
      prompt: "A neon-lit ramen bowl, top-down, steam rising",
      negativePrompt: "blurry, low contrast",
      model: "gemini-3-pro-image-preview",
      aspectRatio: "1:1",
      referenceRoles: ["product"],
      outputSummary: "Glossy hero shot",
    },
  ],
};

describe("creativeSkillSelectionSchema", () => {
  it("accepts a populated selection", () => {
    const parsed = creativeSkillSelectionSchema.safeParse(validSelection);
    expect(parsed.success).toBe(true);
  });

  it("requires at least one node", () => {
    const parsed = creativeSkillSelectionSchema.safeParse({ brandId: "brand-1", nodes: [] });
    expect(parsed.success).toBe(false);
  });

  it("strips unknown node keys instead of rejecting them", () => {
    const parsed = creativeSkillSelectionSchema.safeParse({
      brandId: "brand-1",
      nodes: [{ nodeType: "nanoGen", prompt: "x", futureField: 123 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("futureField" in parsed.data.nodes[0]).toBe(false);
    }
  });

  it("requires a brandId", () => {
    const parsed = creativeSkillSelectionSchema.safeParse({ nodes: validSelection.nodes });
    expect(parsed.success).toBe(false);
  });
});

describe("creativeSkillDraftSchema", () => {
  it("defaults kind to creative_direction and tags to []", () => {
    const parsed = creativeSkillDraftSchema.safeParse({
      name: "Neon food hero",
      directives: "- Top-down framing\n- High-gloss, saturated neon palette",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe("creative_direction");
      expect(parsed.data.tags).toEqual([]);
    }
  });

  it("rejects an empty directives body", () => {
    const parsed = creativeSkillDraftSchema.safeParse({ name: "x", directives: "" });
    expect(parsed.success).toBe(false);
  });

  it("strips extra keys the model may add", () => {
    const parsed = creativeSkillDraftSchema.safeParse({
      name: "Neon food hero",
      directives: "Use neon",
      confidence: 0.9,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("confidence" in parsed.data).toBe(false);
  });
});
