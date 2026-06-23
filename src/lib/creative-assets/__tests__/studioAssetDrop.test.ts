import { describe, expect, it } from "bun:test";
import type { MediaAsset } from "@continuum/contracts";
import {
  STUDIO_ASSET_DROP_MIME,
  buildStudioAssetDropPayload,
} from "../studioAssetDrop";

const baseAsset: MediaAsset = {
  id: "asset-1",
  brandId: "brand-1",
  createdBy: "user-1",
  kind: "image",
  bucket: "media-library",
  storagePath: "brand-1/asset-1/photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  width: 800,
  height: 600,
  durationMs: null,
  source: "ai_generated",
  originRef: { surface: "creative_studio" },
  status: "ready",
  title: "A sunset",
  description: "desc",
  tags: ["sunset"],
  detectedObjects: [],
  adCreativeAnalysis: null,
  embeddingModel: "gemini-embedding-001",
  hasImageEmbedding: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  signedUrl: "https://example.com/signed.jpg",
  thumbnailUrl: null,
};

describe("buildStudioAssetDropPayload", () => {
  it("maps bucket, path, mimeType from the asset", () => {
    const p = buildStudioAssetDropPayload(baseAsset).payload;
    expect(p.source).toBe("supabase");
    expect(p.bucket).toBe("media-library");
    expect(p.path).toBe("brand-1/asset-1/photo.jpg");
    expect(p.mimeType).toBe("image/jpeg");
  });

  it("carries a sanitized https signed url as publicUrl", () => {
    const p = buildStudioAssetDropPayload(baseAsset).payload;
    expect(p.publicUrl).toBe("https://example.com/signed.jpg");
  });

  it("nulls out an unsafe/empty signed url", () => {
    const p = buildStudioAssetDropPayload({ ...baseAsset, signedUrl: "javascript:alert(1)" }).payload;
    expect(p.publicUrl).toBeNull();
  });

  it("nulls out a missing signed url", () => {
    const p = buildStudioAssetDropPayload({ ...baseAsset, signedUrl: null }).payload;
    expect(p.publicUrl).toBeNull();
  });

  it("includes asset meta (id, title, kind)", () => {
    const p = buildStudioAssetDropPayload(baseAsset).payload;
    expect(p.meta).toEqual({ assetId: "asset-1", brandId: "brand-1", title: "A sunset", kind: "image" });
  });

  it("uses the reactflow node-data MIME contract", () => {
    expect(STUDIO_ASSET_DROP_MIME).toBe("application/reactflow-node-data");
    expect(buildStudioAssetDropPayload(baseAsset).type).toBe("asset_drop");
  });
});
