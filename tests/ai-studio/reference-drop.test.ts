import test from "node:test";
import assert from "node:assert/strict";

import {
  inferMimeTypeFromPath,
  IMAGE_REFERENCE_MAX_BYTES,
  MEBIBYTE_BYTES,
  VIDEO_REFERENCE_MAX_BYTES,
  parseReferenceDropPayload,
  resolveReferenceMimeType,
} from "../../src/lib/ai-studio/referenceDrop.ts";

test("parses data-url drops", () => {
  const parsed = parseReferenceDropPayload("data:image/png;base64,AAA=");
  assert.ok(parsed);
  assert.equal(parsed.kind, "data-url");
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.base64, "AAA=");
  assert.equal(resolveReferenceMimeType(parsed), "image/png");
});

test("parses legacy creative asset payloads", () => {
  const raw = JSON.stringify({ name: "Ref", path: "creative/ref.png", contentType: "image/png" });
  const parsed = parseReferenceDropPayload(raw);
  assert.ok(parsed);
  assert.equal(parsed.kind, "remote");
  assert.equal(parsed.path, "creative/ref.png");
  assert.equal(resolveReferenceMimeType(parsed), "image/png");
});

test("parses reactflow asset_drop payloads with size metadata", () => {
  const raw = JSON.stringify({
    type: "asset_drop",
    payload: {
      path: "creative/video.mp4",
      publicUrl: "https://cdn.example.com/video.mp4",
      mimeType: "video/mp4",
      meta: { size: 123456 },
    },
  });
  const parsed = parseReferenceDropPayload(raw);
  assert.ok(parsed);
  assert.equal(parsed.kind, "remote");
  assert.equal(parsed.path, "creative/video.mp4");
  assert.equal(parsed.publicUrl, "https://cdn.example.com/video.mp4");
  assert.equal(parsed.mimeType, "video/mp4");
  assert.equal(parsed.sizeBytes, 123456);
  assert.equal(resolveReferenceMimeType(parsed), "video/mp4");
});

test("infers mime type from plain text urls and paths", () => {
  assert.equal(inferMimeTypeFromPath("https://example.com/asset.png?x=1"), "image/png");
  assert.equal(inferMimeTypeFromPath("file.MP4"), "video/mp4");

  const parsed = parseReferenceDropPayload("https://example.com/movie.webm");
  assert.ok(parsed);
  assert.equal(parsed.kind, "remote");
  assert.equal(resolveReferenceMimeType(parsed), "video/webm");
});

test("exports MiB-based attachment limits", () => {
  assert.equal(MEBIBYTE_BYTES, 1024 * 1024);
  assert.equal(IMAGE_REFERENCE_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(VIDEO_REFERENCE_MAX_BYTES, 50 * 1024 * 1024);
});
