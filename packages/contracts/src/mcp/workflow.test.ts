import { describe, expect, it } from "bun:test";

import { canvasRunResultSchema, mcpStudioWorkflowSchema } from "./workflow";

const base = {
  name: "Sneaker hero",
  target: "canvas" as const,
  node_count: 3,
  edge_count: 2,
  node_types: { string: 1, nanoGen: 1, veoFast: 1 },
  nodes: [
    { id: "prompt", type: "string", label: "Brief", config: { value: "a red sneaker" } },
    { id: "img", type: "nanoGen", config: { model: "nano-banana-2" } },
    { id: "vid", type: "veoFast" },
  ],
  wiring: ["prompt.text → img.prompt", "img.image → vid.first-frame"],
  attachments: [{ node_id: "ref", handle: "ref-image", media_kind: "image" as const, file_name: "p.png", asset_ref: "asset-1" }],
  validation: { ok: true, issues: [] },
};

describe("mcpStudioWorkflowSchema", () => {
  it("parses a lean workflow summary", () => {
    const parsed = mcpStudioWorkflowSchema.parse({ ...base, workflow_id: "wf-1", room_id: "room-1", open_url: "https://app/studio" });
    expect(parsed.node_count).toBe(3);
    expect(parsed.attachments[0].media_kind).toBe("image");
  });

  it("accepts a change summary on an edit result", () => {
    const parsed = mcpStudioWorkflowSchema.parse({ ...base, change_summary: "wired img.image → vid.first-frame" });
    expect(parsed.change_summary).toContain("wired");
  });

  it("rejects leaking a signed url / bucket / storage path (strict, lean boundary)", () => {
    expect(mcpStudioWorkflowSchema.safeParse({ ...base, signed_url: "https://x" }).success).toBe(false);
    const attachmentWithUrl = {
      ...base,
      attachments: [{ node_id: "ref", handle: "ref-image", media_kind: "image", storage_path: "b/p.png" }],
    };
    expect(mcpStudioWorkflowSchema.safeParse(attachmentWithUrl).success).toBe(false);
  });
});

describe("canvasRunResultSchema", () => {
  it("parses a run summary with outputs and failures", () => {
    const parsed = canvasRunResultSchema.parse({
      executed_node_ids: ["img", "vid"],
      outputs: [
        { node_id: "img", kind: "image" },
        { node_id: "vid", kind: "video" },
      ],
      failed: [{ node_id: "vid2", error: "generation timed out" }],
    });
    expect(parsed.executed_node_ids).toEqual(["img", "vid"]);
    expect(parsed.outputs[0].kind).toBe("image");
    expect(parsed.failed?.[0].error).toContain("timed out");
  });

  it("allows a run with no failures", () => {
    const parsed = canvasRunResultSchema.parse({
      executed_node_ids: ["text"],
      outputs: [{ node_id: "text", kind: "text" }],
    });
    expect(parsed.failed).toBeUndefined();
  });

  it("rejects base64 / signed url leakage (media-free boundary)", () => {
    const withBlob = {
      executed_node_ids: ["img"],
      outputs: [{ node_id: "img", kind: "image", base64: "data:image/png;base64,AAAA" }],
    };
    expect(canvasRunResultSchema.safeParse(withBlob).success).toBe(false);
    const unknownKind = {
      executed_node_ids: ["x"],
      outputs: [{ node_id: "x", kind: "audio" }],
    };
    expect(canvasRunResultSchema.safeParse(unknownKind).success).toBe(false);
  });
});
