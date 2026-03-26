import { describe, expect, it, mock } from "bun:test";
import type { StudioNode } from "../types";
import { rehydrateWorkflowMediaNodes } from "./rehydrateWorkflowMedia";

describe("rehydrateWorkflowMediaNodes", () => {
  it("rehydrates image and video nodes from stored source metadata", async () => {
    const resolver = mock(async (_parsed, maxBytes: number) => {
      if (maxBytes > 10 * 1024 * 1024) {
        return { base64: "video_base64", sourceName: "asset.mp4", byteLength: 1024 };
      }
      return { base64: "image_base64", sourceName: "asset.png", byteLength: 512 };
    });

    const nodes: StudioNode[] = [
      {
        id: "img-1",
        type: "image",
        position: { x: 0, y: 0 },
        data: {
          image: undefined,
          sourcePath: "brand-assets/image.png",
          sourceUrl: "https://cdn.continuum.test/image.png",
        } as any,
      },
      {
        id: "vid-1",
        type: "video",
        position: { x: 0, y: 0 },
        data: {
          video: undefined,
          sourcePath: "brand-assets/video.mp4",
          sourceUrl: "https://cdn.continuum.test/video.mp4",
        } as any,
      },
    ];

    const hydrated = await rehydrateWorkflowMediaNodes(nodes, resolver);
    const imageNode = hydrated.find((node) => node.id === "img-1");
    const videoNode = hydrated.find((node) => node.id === "vid-1");

    expect((imageNode?.data as any).image).toBe("data:image/png;base64,image_base64");
    expect((imageNode?.data as any).fileName).toBe("asset.png");
    expect((videoNode?.data as any).video).toBe("data:video/mp4;base64,video_base64");
    expect((videoNode?.data as any).fileName).toBe("asset.mp4");
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("does not rehydrate nodes that already have data URLs", async () => {
    const resolver = mock(async () => ({ base64: "unused" }));
    const nodes: StudioNode[] = [
      {
        id: "img-1",
        type: "image",
        position: { x: 0, y: 0 },
        data: {
          image: "data:image/png;base64,already_here",
          sourcePath: "brand-assets/image.png",
          sourceUrl: "https://cdn.continuum.test/image.png",
        } as any,
      },
    ];

    const hydrated = await rehydrateWorkflowMediaNodes(nodes, resolver);
    expect((hydrated[0].data as any).image).toBe("data:image/png;base64,already_here");
    expect(resolver).toHaveBeenCalledTimes(0);
  });
});
