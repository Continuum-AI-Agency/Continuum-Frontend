import { describe, expect, it } from "bun:test";

import { AGENT_FIELD_WHITELIST, projectGraphForAgent } from "./workflow-projection";

const SIGNED_URL = "https://signed.example.com/object/sign/media-library/brand-1/p.png?token=" + "x".repeat(300);

const fatGraph = {
  nodes: [
    {
      id: "prompt",
      type: "string",
      position: { x: 12.5, y: 880.2 },
      style: { width: 320, height: 120 },
      width: 320,
      height: 120,
      selected: true,
      dragging: false,
      measured: { width: 320, height: 120 },
      data: { value: "a red sneaker on wet concrete, dramatic lighting", isExecuting: false, isToolbarVisible: true, label: "Brief" },
    },
    {
      id: "ref",
      type: "image",
      position: { x: 0, y: 0 },
      data: {
        fileName: "product-shot.png",
        sourcePath: "brand-1/uploads/product-shot.png",
        bucket: "media-library",
        sourceUrl: SIGNED_URL,
        referenceType: "product",
        assetId: "asset-99",
        image: "data:image/png;base64," + "A".repeat(500),
      },
    },
    {
      id: "img",
      type: "nanoGen",
      position: { x: 360, y: 0 },
      data: { model: "nano-banana-2", positivePrompt: "", aspectRatio: "16:9", imageSize: "512px", generatedImageUrl: SIGNED_URL },
    },
  ],
  edges: [
    { id: "e1", source: "prompt", target: "img", sourceHandle: "text", targetHandle: "prompt" },
    { id: "e2", source: "ref", target: "img", sourceHandle: "image", targetHandle: "ref-image" },
  ],
};

describe("projectGraphForAgent", () => {
  const projection = projectGraphForAgent(fatGraph);
  const json = JSON.stringify(projection);

  it("counts nodes, edges, and node types", () => {
    expect(projection.node_count).toBe(3);
    expect(projection.edge_count).toBe(2);
    expect(projection.node_types).toEqual({ string: 1, image: 1, nanoGen: 1 });
  });

  it("collapses edges into readable wiring strings", () => {
    expect(projection.wiring).toContain("prompt.text → img.prompt");
    expect(projection.wiring).toContain("ref.image → img.ref-image");
  });

  it("surfaces only whitelisted node config and keeps the label", () => {
    const promptNode = projection.nodes.find((n) => n.id === "prompt");
    expect(promptNode?.label).toBe("Brief");
    expect(promptNode?.config?.value).toBe("a red sneaker on wet concrete, dramatic lighting");
    // runtime + xyflow internals never reach the agent
    expect(JSON.stringify(promptNode)).not.toContain("isExecuting");
    expect(JSON.stringify(promptNode)).not.toContain("isToolbarVisible");
  });

  it("reports attachments by identity, on the handle they feed", () => {
    const attachment = projection.attachments.find((a) => a.node_id === "ref");
    expect(attachment).toBeDefined();
    expect(attachment?.file_name).toBe("product-shot.png");
    expect(attachment?.media_kind).toBe("image");
    expect(attachment?.handle).toBe("ref-image");
    expect(attachment?.asset_ref).toBe("asset-99");
  });

  it("never leaks signed URLs, buckets, storage paths, or base64 into the agent payload", () => {
    expect(json).not.toContain("token=");
    expect(json).not.toContain("media-library");
    expect(json).not.toContain("uploads/product-shot.png");
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("base64");
    expect(json).not.toContain("sourceUrl");
    expect(json).not.toContain("generatedImageUrl");
  });

  it("is dramatically smaller than the raw graph", () => {
    expect(json.length).toBeLessThan(JSON.stringify(fatGraph).length / 2);
  });

  it("caps long free-text fields", () => {
    const longText = "word ".repeat(200);
    const projected = projectGraphForAgent({
      nodes: [{ id: "s", type: "string", position: { x: 0, y: 0 }, data: { value: longText } }],
      edges: [],
    });
    const value = projected.nodes[0].config?.value as string;
    expect(value.length).toBeLessThan(longText.length);
    expect(value.endsWith("…")).toBe(true);
  });

  it("exposes a per-type field whitelist", () => {
    expect(AGENT_FIELD_WHITELIST.nanoGen).toContain("model");
    expect(AGENT_FIELD_WHITELIST.string).toEqual(["value"]);
  });
});
