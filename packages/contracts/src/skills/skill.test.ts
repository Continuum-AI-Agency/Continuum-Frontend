import { describe, expect, it } from "bun:test";

import { skillSchema, skillKindSchema } from "./skill";
import { createSkillRequestSchema, updateSkillRequestSchema } from "./skill-request";
import { listSkillsResponseSchema } from "./skill-response";

const validSkill = {
  id: "skill-1",
  brandId: "brand-1",
  createdBy: "user-1",
  name: "On-brand caption voice",
  slug: "on-brand-caption-voice",
  description: "How captions should read.",
  kind: "creative_direction" as const,
  directives: "- Lead with a hook under 8 words\n- Lowercase, no em-dashes",
  tags: ["voice", "captions"],
  status: "active" as const,
  createdAt: "2026-06-06T00:00:00.000Z",
  updatedAt: "2026-06-06T00:00:00.000Z",
};

describe("skillSchema", () => {
  it("round-trips a valid skill", () => {
    const parsed = skillSchema.safeParse(validSkill);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe("creative_direction");
  });

  it("defaults tags to an empty array", () => {
    const { tags: _tags, ...rest } = validSkill;
    const parsed = skillSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tags).toEqual([]);
  });

  it("rejects an unknown kind", () => {
    expect(skillKindSchema.safeParse("growth_hacking").success).toBe(false);
  });

  it("rejects empty directives", () => {
    const parsed = skillSchema.safeParse({ ...validSkill, directives: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("createSkillRequestSchema", () => {
  it("accepts a minimal create request and defaults the kind", () => {
    const parsed = createSkillRequestSchema.safeParse({
      brandId: "brand-1",
      name: "Monthly audit",
      directives: "Run the audit checklist...",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe("creative_direction");
  });

  it("rejects a create request without directives", () => {
    const parsed = createSkillRequestSchema.safeParse({ brandId: "brand-1", name: "x" });
    expect(parsed.success).toBe(false);
  });
});

describe("updateSkillRequestSchema", () => {
  it("accepts a single-field update", () => {
    expect(updateSkillRequestSchema.safeParse({ status: "archived" }).success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateSkillRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("listSkillsResponseSchema", () => {
  it("wraps an array of skills", () => {
    const parsed = listSkillsResponseSchema.safeParse({ skills: [validSkill] });
    expect(parsed.success).toBe(true);
  });
});
