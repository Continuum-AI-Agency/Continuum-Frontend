import test from "node:test";
import assert from "node:assert/strict";

import {
  mapPromptTemplateRow,
  promptTemplateCreateSchema,
  promptTemplateListSchema,
  promptTemplateRowSchema,
  promptTemplateUpdateSchema,
} from "../../src/lib/schemas/promptTemplates";

test("validates prompt template create payload", () => {
  const parsed = promptTemplateCreateSchema.parse({
    brandProfileId: "6f22f5f2-1f2d-4b6b-9b7d-5c7c788f0a76",
    name: "Product shot",
    prompt: "A glossy product on neutral background",
  });

  assert.equal(parsed.name, "Product shot");
});

test("validates prompt template list payload", () => {
  const parsed = promptTemplateListSchema.parse({
    brandProfileId: "6f22f5f2-1f2d-4b6b-9b7d-5c7c788f0a76",
    query: "glossy",
  });

  assert.equal(parsed.query, "glossy");
});

test("rejects empty prompt template updates", () => {
  assert.throws(() =>
    promptTemplateUpdateSchema.parse({
      id: "6f22f5f2-1f2d-4b6b-9b7d-5c7c788f0a76",
    })
  );
});

test("accepts prompt template updates with at least one field", () => {
  const parsed = promptTemplateUpdateSchema.parse({
    id: "6f22f5f2-1f2d-4b6b-9b7d-5c7c788f0a76",
    name: "Updated name",
  });

  assert.equal(parsed.name, "Updated name");
});

test("maps prompt template row to UI shape", () => {
  const row = promptTemplateRowSchema.parse({
    id: "6f22f5f2-1f2d-4b6b-9b7d-5c7c788f0a76",
    brand_profile_id: "d3353c9f-cd7f-4f62-8c2e-75d8c56a7b0a",
    name: "Hero shot",
    prompt: "Studio lighting, shallow depth of field",
    category: "Custom",
    source: "custom",
    created_at: "2025-12-22T00:00:00.000Z",
    updated_at: "2025-12-22T00:00:00.000Z",
  });

  const mapped = mapPromptTemplateRow(row);
  assert.equal(mapped.brandProfileId, "d3353c9f-cd7f-4f62-8c2e-75d8c56a7b0a");
  assert.equal(mapped.prompt, "Studio lighting, shallow depth of field");
});
