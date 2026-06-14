import { describe, expect, it } from "bun:test";
import type { StudioNode } from "@/StudioCanvas/types";
import { buildCanvasReference, getCanvasPreview } from "./canvasMentions";

const node = (id: string, type: string, data: Record<string, unknown>): StudioNode =>
  ({ id, type, data }) as unknown as StudioNode;

describe("getCanvasPreview", () => {
  it("reads the generated image URL for an image node", () => {
    const preview = getCanvasPreview(
      node("n1", "nanoGen", { generatedImageUrl: "https://cdn/img.png", label: "Hero" }),
    );
    expect(preview).toMatchObject({ url: "https://cdn/img.png", kind: "image", label: "Hero" });
  });

  it("reads the generated video URL for a video node", () => {
    const preview = getCanvasPreview(
      node("n2", "videoGen", { generatedVideoUrl: "https://cdn/clip.mp4" }),
    );
    expect(preview).toMatchObject({ url: "https://cdn/clip.mp4", kind: "video" });
  });
});

describe("buildCanvasReference", () => {
  it("forwards the preview URL and output kind into reference metadata (Gap B fix)", () => {
    const ref = buildCanvasReference(
      node("n1", "nanoGen", { generatedImageUrl: "https://cdn/img.png", label: "Hero" }),
    );
    expect(ref.type).toBe("canvas_node");
    expect(ref.id).toBe("n1");
    expect(ref.metadata).toMatchObject({
      nodeId: "n1",
      nodeType: "nanoGen",
      outputKind: "image",
      previewUrl: "https://cdn/img.png",
    });
  });

  it("marks a video node so the backend keeps it text-only", () => {
    const ref = buildCanvasReference(
      node("n2", "videoGen", { generatedVideoUrl: "https://cdn/clip.mp4" }),
    );
    expect(ref.metadata).toMatchObject({ outputKind: "video", previewUrl: "https://cdn/clip.mp4" });
  });

  it("forwards a null preview URL when the node has no generated output", () => {
    const ref = buildCanvasReference(node("n3", "string", { label: "Prompt" }));
    expect(ref.metadata?.previewUrl).toBeNull();
  });
});
