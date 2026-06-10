import { describe, expect, it } from "bun:test";

import type { RegisterCanvasAssetRequest } from "@continuum/contracts";
import { buildCanvasAssetRow, shouldAnalyzeCanvasAsset } from "./canvas-register";

const baseRequest: RegisterCanvasAssetRequest = {
  brandProfileId: "11111111-1111-1111-1111-111111111111",
  kind: "image",
  bucket: "brand-profile-assets",
  storagePath: "11111111-1111-1111-1111-111111111111/canvas/node-7/out.png",
  fileName: "out.png",
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  originRef: {
    kind: "canvas",
    roomId: "room-1",
    nodeId: "node-7",
    prompt: "a red bicycle",
    model: "nano-banana",
    generator: "nano_gen",
  },
};

describe("buildCanvasAssetRow", () => {
  it("maps the request to a canvas-source media.assets row with provenance", () => {
    const row = buildCanvasAssetRow(baseRequest, "user-1");
    expect(row).toEqual({
      brand_id: baseRequest.brandProfileId,
      created_by: "user-1",
      kind: "image",
      bucket: "brand-profile-assets",
      storage_path: baseRequest.storagePath,
      file_name: "out.png",
      mime_type: "image/png",
      width: 1024,
      height: 1024,
      duration_ms: null,
      source: "canvas",
      origin_ref: baseRequest.originRef,
      status: "stored",
    });
  });

  it("defaults optional dimensions and userId to null", () => {
    const row = buildCanvasAssetRow(
      { ...baseRequest, width: undefined, height: undefined, durationMs: undefined },
      null,
    );
    expect(row.created_by).toBeNull();
    expect(row.width).toBeNull();
    expect(row.height).toBeNull();
    expect(row.duration_ms).toBeNull();
  });

  it("carries durationMs through for video", () => {
    const row = buildCanvasAssetRow(
      { ...baseRequest, kind: "video", mimeType: "video/mp4", durationMs: 8000 },
      "user-1",
    );
    expect(row.kind).toBe("video");
    expect(row.duration_ms).toBe(8000);
  });
});

describe("shouldAnalyzeCanvasAsset", () => {
  it("analyzes images only", () => {
    expect(shouldAnalyzeCanvasAsset("image")).toBe(true);
    expect(shouldAnalyzeCanvasAsset("video")).toBe(false);
  });
});
