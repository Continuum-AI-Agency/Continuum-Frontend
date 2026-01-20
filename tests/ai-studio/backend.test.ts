import test from "node:test";
import assert from "node:assert/strict";

import { mapBackendGenerationResponse, mapBackendTemplatesResponse } from "../../src/lib/ai-studio/backend";
import {
  aiStudioGenerationRequestSchema,
  aiStudioWorkflowRowSchema,
  mapAiStudioWorkflowRow,
  type AiStudioGenerationRequest,
} from "../../src/lib/schemas/aiStudio";

test("mapBackendGenerationResponse converts backend payload to camelCase", () => {
  const now = new Date().toISOString();
  const backendPayload = {
    job: {
      id: "job-123",
      brand_profile_id: "brand-456",
      provider: "nano-banana",
      medium: "image",
      template_id: null,
      prompt: "High-contrast portrait of a founder standing in neon light",
      negative_prompt: null,
      aspect_ratio: "4:5",
      duration_seconds: null,
      status: "completed",
      created_at: now,
      updated_at: now,
      artifacts: [
        {
          id: "artifact-1",
          uri: "https://cdn.example.com/artifact.png",
          preview_uri: null,
          mime_type: "image/png",
          medium: "image",
          file_name: "artifact.png",
          size_bytes: 1024,
          metadata: { palette: "brand" },
          created_at: now,
        },
      ],
      failure: null,
      metadata: { project: "launch" },
    },
  };

  const { job } = mapBackendGenerationResponse(backendPayload);

  assert.equal(job.id, backendPayload.job.id);
  assert.equal(job.brandProfileId, backendPayload.job.brand_profile_id);
  assert.equal(job.prompt, backendPayload.job.prompt);
  assert.equal(job.aspectRatio, backendPayload.job.aspect_ratio ?? undefined);
  assert.equal(job.status, "completed");
  assert.equal(job.artifacts.length, 1);
  assert.equal(job.artifacts[0].previewUri, undefined);
  assert.equal(job.artifacts[0].mimeType, "image/png");
  assert.equal(job.artifacts[0].uri, backendPayload.job.artifacts[0].uri);
  assert.deepEqual(job.metadata, { project: "launch" });
});

test("mapBackendTemplatesResponse normalizes tags and defaults", () => {
  const payload = {
    templates: [
      {
        id: "template-1",
        name: "Product hero",
        description: null,
        provider: "nano-banana",
        medium: "image",
        aspect_ratio: "16:9",
        default_prompt: "Hero shot on gradient background",
        default_negative_prompt: null,
        metadata: { category: "hero" },
        tags: ["evergreen", undefined],
      },
    ],
  };

  const { templates } = mapBackendTemplatesResponse(payload);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].id, "template-1");
  assert.equal(templates[0].tags?.length, 1);
  assert.equal(templates[0].tags?.[0], "evergreen");
});

test("aiStudioGenerationRequestSchema validates numeric coercion", () => {
  const request: AiStudioGenerationRequest = {
    brandProfileId: "brand-123",
    provider: "nano-banana",
    medium: "image",
    prompt: "Test prompt for generation",
    negativePrompt: undefined,
    templateId: undefined,
    aspectRatio: "1:1",
    durationSeconds: undefined,
    guidanceScale: 7,
    seed: 42,
  };

  const parsed = aiStudioGenerationRequestSchema.parse(request);
  assert.equal(parsed.prompt, request.prompt);
  assert.equal(parsed.guidanceScale, 7);
});

test("aiStudioGenerationRequestSchema rejects missing prompt", () => {
  assert.throws(
    () =>
      aiStudioGenerationRequestSchema.parse({
        brandProfileId: "brand-123",
        provider: "nano-banana",
        medium: "image",
        prompt: "",
      }),
    /Prompt is required/
  );
});

test("mapAiStudioWorkflowRow maps workflow rows to camelCase", () => {
  const now = new Date().toISOString();
  const row = aiStudioWorkflowRowSchema.parse({
    id: "workflow-1",
    brand_profile_id: "brand-123",
    name: "Launch workflow",
    description: null,
    nodes: [{ id: "node-1" }],
    edges: [{ id: "edge-1" }],
    metadata: { version: 1 },
    created_at: now,
    updated_at: now,
  });

  const workflow = mapAiStudioWorkflowRow(row);
  assert.equal(workflow.brandProfileId, "brand-123");
  assert.equal(workflow.name, "Launch workflow");
  assert.equal(workflow.nodes.length, 1);
  assert.equal(workflow.edges.length, 1);
  assert.equal(workflow.createdAt, now);
});

