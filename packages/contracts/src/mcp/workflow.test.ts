import { describe, expect, it } from "bun:test";

import { mcpStudioWorkflowSchema } from "./workflow";

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
