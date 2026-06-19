import { describe, expect, it } from "bun:test";

import {
  STUDIO_NODE_TYPES,
  studioNodeTypeEnum,
  studioWorkflowGraphSchema,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  isValidConnection,
  mediaKindForHandle,
  isMediaKindCompatibleWithHandle,
  createNodeData,
  resolveVideoGeneratorModel,
  getVideoGeneratorTargetHandles,
} from "./workflow-graph";

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

const nodes = [
  node("string1", "string", { value: "" }),
  node("string2", "string", { value: "" }),
  node("image1", "image", { image: "" }),
  node("audio1", "audio", { audio: "" }),
  node("audio2", "audio", { audio: "" }),
  node("doc1", "document", { documents: [] }),
  node("doc2", "document", { documents: [] }),
  node("nano1", "nanoGen", { positivePrompt: "" }),
  node("video1", "video", { video: "" }),
  node("extend1", "extendVideo", { prompt: "" }),
  node("videoGen1", "videoGen", { model: "kling-omni", prompt: "" }),
];

describe("node type enum + schema", () => {
  it("exposes the twelve canvas node types", () => {
    expect(STUDIO_NODE_TYPES).toContain("nanoGen");
    expect(STUDIO_NODE_TYPES).toContain("videoDecode");
    expect(STUDIO_NODE_TYPES).toHaveLength(12);
  });

  it("rejects an unknown node type", () => {
    expect(studioNodeTypeEnum.safeParse("magicNode").success).toBe(false);
  });

  it("parses a minimal graph and preserves free-form node data", () => {
    const parsed = studioWorkflowGraphSchema.parse({
      nodes: [node("n1", "string", { value: "hi", customRuntimeKey: 7 })],
      edges: [],
    });
    expect((parsed.nodes[0].data as Record<string, unknown>).customRuntimeKey).toBe(7);
  });
});

describe("handle vocabulary", () => {
  it("returns the single source handle per node type", () => {
    expect(getAllowedSourceHandles(node("s", "string"))).toEqual(["text"]);
    expect(getAllowedSourceHandles(node("i", "image"))).toEqual(["image"]);
    expect(getAllowedSourceHandles(node("n", "nanoGen"))).toEqual(["image"]);
  });

  it("returns reference-input target handles for nanoGen", () => {
    const handles = getAllowedTargetHandles(node("n", "nanoGen"));
    expect(handles).toContain("prompt");
    expect(handles).toContain("ref-image");
    expect(handles).toContain("ref-images");
  });

  it("gates video-generator target handles by model", () => {
    // veo-3.1-fast → frames, no reference images
    expect(getVideoGeneratorTargetHandles("veo-3.1-fast")).toContain("first-frame");
    expect(getVideoGeneratorTargetHandles("veo-3.1-fast")).not.toContain("ref-images");
    // kling-omni → reference video
    expect(getVideoGeneratorTargetHandles("kling-omni")).toContain("ref-video");
  });

  it("resolves the video model from node type when data.model is absent", () => {
    expect(resolveVideoGeneratorModel(node("v", "veoFast"))).toBe("veo-3.1-fast");
    expect(resolveVideoGeneratorModel(node("v", "veoDirector"))).toBe("veo-3.1");
    expect(resolveVideoGeneratorModel(node("v", "videoGen", { model: "seedance-2.0" }))).toBe("seedance-2.0");
  });
});

describe("isValidConnection — type matrix", () => {
  it("allows image → string image handle", () => {
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "string1", targetHandle: "image" }, [], nodes),
    ).toBe(true);
  });

  it("rejects image → string audio handle (mismatched kind)", () => {
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "string1", targetHandle: "audio" }, [], nodes),
    ).toBe(false);
  });

  it("allows string → nanoGen prompt", () => {
    expect(
      isValidConnection({ source: "string1", sourceHandle: "text", target: "nano1", targetHandle: "prompt" }, [], nodes),
    ).toBe(true);
  });

  it("rejects image → nanoGen prompt but allows image → nanoGen ref-image", () => {
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "nano1", targetHandle: "prompt" }, [], nodes),
    ).toBe(false);
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "nano1", targetHandle: "ref-image" }, [], nodes),
    ).toBe(true);
  });

  it("allows video → extendVideo but rejects string → extendVideo video handle", () => {
    expect(
      isValidConnection({ source: "video1", sourceHandle: "video", target: "extend1", targetHandle: "video" }, [], nodes),
    ).toBe(true);
    expect(
      isValidConnection({ source: "string1", sourceHandle: "text", target: "extend1", targetHandle: "video" }, [], nodes),
    ).toBe(false);
  });

  it("allows video → kling-omni ref-video", () => {
    expect(
      isValidConnection({ source: "video1", sourceHandle: "video", target: "videoGen1", targetHandle: "ref-video" }, [], nodes),
    ).toBe(true);
  });

  it("allows veo-lite first-frame but rejects veo-lite ref-images", () => {
    const liteNodes = [...nodes, node("veoLite", "videoGen", { model: "veo-3.1-lite", prompt: "" })];
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "veoLite", targetHandle: "first-frame" }, [], liteNodes),
    ).toBe(true);
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "veoLite", targetHandle: "ref-images" }, [], liteNodes),
    ).toBe(false);
  });
});

describe("isValidConnection — connection limits", () => {
  it("enforces single text input on a nanoGen prompt", () => {
    const edges = [{ id: "e1", source: "string1", sourceHandle: "text", target: "nano1", targetHandle: "prompt" }];
    expect(
      isValidConnection({ source: "string2", sourceHandle: "text", target: "nano1", targetHandle: "prompt" }, edges, nodes),
    ).toBe(false);
  });

  it("allows multiple document inputs to a string node", () => {
    const edges = [{ id: "e1", source: "doc1", sourceHandle: "document", target: "string1", targetHandle: "document" }];
    expect(
      isValidConnection({ source: "doc2", sourceHandle: "document", target: "string1", targetHandle: "document" }, edges, nodes),
    ).toBe(true);
  });

  it("enforces the default 14 ref-image limit on nanoGen", () => {
    const edges = Array.from({ length: 14 }, (_, i) => ({
      id: `e${i}`,
      source: `img${i}`,
      sourceHandle: "image",
      target: "nano1",
      targetHandle: "ref-image",
    }));
    expect(
      isValidConnection({ source: "image1", sourceHandle: "image", target: "nano1", targetHandle: "ref-image" }, edges, nodes),
    ).toBe(false);
  });

  it("respects a configured maxReferenceImages on nanoGen", () => {
    const customNodes = nodes.map((n) => (n.id === "nano1" ? node("nano1", "nanoGen", { maxReferenceImages: 5 }) : n));
    const edges = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      source: `img${i}`,
      sourceHandle: "image",
      target: "nano1",
      targetHandle: "ref-image",
    }));
    expect(
      isValidConnection({ source: "imageX", sourceHandle: "image", target: "nano1", targetHandle: "ref-image" }, edges, customNodes),
    ).toBe(false);
  });

  it("reports the connection limit for a known handle", () => {
    expect(getTargetHandleConnectionLimit(node("e", "extendVideo"), "video", [])).toBe(1);
    expect(getTargetHandleConnectionLimit(node("n", "nanoGen"), "ref-image", [])).toBe(14);
  });
});

describe("media kind ↔ handle compatibility", () => {
  it("maps target handles to the media kind they accept", () => {
    expect(mediaKindForHandle("ref-image")).toBe("image");
    expect(mediaKindForHandle("first-frame")).toBe("image");
    expect(mediaKindForHandle("ref-video")).toBe("video");
    expect(mediaKindForHandle("document")).toBe("document");
    expect(mediaKindForHandle("prompt")).toBeUndefined();
  });

  it("accepts an image asset on an image handle but not a video handle", () => {
    expect(isMediaKindCompatibleWithHandle("image", node("n", "nanoGen"), "ref-image")).toBe(true);
    expect(isMediaKindCompatibleWithHandle("video", node("n", "nanoGen"), "ref-image")).toBe(false);
  });

  it("accepts a video asset on a kling-omni ref-video handle", () => {
    expect(isMediaKindCompatibleWithHandle("video", node("v", "videoGen", { model: "kling-omni" }), "ref-video")).toBe(true);
  });
});

describe("createNodeData defaults", () => {
  it("mirrors the canvas nanoGen defaults", () => {
    const { data, style } = createNodeData("nanoGen");
    expect(data.model).toBe("nano-banana-2");
    expect(data.imageSize).toBe("512px");
    expect(style).toEqual({ width: 400, height: 225 });
  });

  it("derives the video model from the node type", () => {
    expect(createNodeData("veoFast").data.model).toBe("veo-3.1-fast");
    expect(createNodeData("veoDirector").data.model).toBe("veo-3.1");
  });

  it("seeds an empty string node and an aspect-ratioed image node", () => {
    expect(createNodeData("string").data.value).toBe("");
    expect(createNodeData("image").data.aspectRatio).toBe("1:1");
  });

  it("applies overrides over the defaults", () => {
    expect(createNodeData("nanoGen", { positivePrompt: "a cat" }).data.positivePrompt).toBe("a cat");
  });
});
