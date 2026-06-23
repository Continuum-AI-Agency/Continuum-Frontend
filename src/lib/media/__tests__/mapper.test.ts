import { describe, expect, it } from "bun:test";
import { rowToMediaAsset } from "../mapper";
import { mediaAssetSchema } from "@continuum/contracts";
import type { MediaAssetRow } from "../schema";

const baseRow: MediaAssetRow = {
  id: "asset-1",
  brand_id: "brand-1",
  created_by: "user-1",
  kind: "image",
  bucket: "media-library",
  storage_path: "brand-1/asset-1/photo.jpg",
  file_name: "photo.jpg",
  mime_type: "image/jpeg",
  size_bytes: 204800,
  width: 1920,
  height: 1080,
  duration_ms: null,
  source: "upload",
  origin_ref: null,
  status: "ready",
  progress_step: null,
  error_code: null,
  error_message: null,
  title: "A beautiful sunset",
  description: "A scenic photo of a sunset over the ocean.",
  tags: ["sunset", "ocean", "nature"],
  ad_creative_analysis: null,
  detected_objects: null,
  embedding_model: "gemini-embedding-001",
  has_image_embedding: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T01:00:00Z",
  deleted_at: null,
};

describe("rowToMediaAsset", () => {
  it("maps all scalar fields correctly", () => {
    const asset = rowToMediaAsset(baseRow);
    expect(asset.id).toBe("asset-1");
    expect(asset.brandId).toBe("brand-1");
    expect(asset.kind).toBe("image");
    expect(asset.status).toBe("ready");
    expect(asset.fileName).toBe("photo.jpg");
    expect(asset.sizeBytes).toBe(204800);
    expect(asset.width).toBe(1920);
    expect(asset.height).toBe(1080);
  });

  it("maps tags to an array", () => {
    const asset = rowToMediaAsset(baseRow);
    expect(asset.tags).toEqual(["sunset", "ocean", "nature"]);
  });

  it("defaults tags to [] when row.tags is null", () => {
    const row: MediaAssetRow = { ...baseRow, tags: null };
    const asset = rowToMediaAsset(row);
    expect(asset.tags).toEqual([]);
  });

  it("sets hasImageEmbedding=false when has_image_embedding is false", () => {
    const asset = rowToMediaAsset(baseRow);
    expect(asset.hasImageEmbedding).toBe(false);
  });

  it("sets hasImageEmbedding=true when has_image_embedding is true", () => {
    const row: MediaAssetRow = { ...baseRow, has_image_embedding: true };
    const asset = rowToMediaAsset(row);
    expect(asset.hasImageEmbedding).toBe(true);
  });

  it("attaches signed URL when provided", () => {
    const asset = rowToMediaAsset(baseRow, "https://example.com/signed");
    expect(asset.signedUrl).toBe("https://example.com/signed");
  });

  it("defaults signedUrl to null when not provided", () => {
    const asset = rowToMediaAsset(baseRow);
    expect(asset.signedUrl).toBeNull();
  });

  it("parses detected_objects with bounding boxes", () => {
    const row: MediaAssetRow = {
      ...baseRow,
      detected_objects: [
        { label: "person", confidence: 0.95, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
        { label: "car", confidence: 0.8, box: null },
      ],
    };
    const asset = rowToMediaAsset(row);
    expect(asset.detectedObjects).toHaveLength(2);
    expect(asset.detectedObjects[0].label).toBe("person");
    expect(asset.detectedObjects[0].box?.x).toBe(0.1);
    expect(asset.detectedObjects[1].label).toBe("car");
    expect(asset.detectedObjects[1].box).toBeNull();
  });

  it("skips detected_objects entries missing a label", () => {
    const row: MediaAssetRow = {
      ...baseRow,
      detected_objects: [{ label: "", confidence: 0.5 }, { label: "dog", confidence: 0.9 }],
    };
    const asset = rowToMediaAsset(row);
    // Empty-label entry is skipped
    expect(asset.detectedObjects).toHaveLength(1);
    expect(asset.detectedObjects[0].label).toBe("dog");
  });

  it("produces output that passes mediaAssetSchema.safeParse", () => {
    const asset = rowToMediaAsset(baseRow, "https://example.com/signed");
    const result = mediaAssetSchema.safeParse(asset);
    expect(result.success).toBe(true);
  });
});
