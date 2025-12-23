import test from "node:test";
import assert from "node:assert/strict";

import { applyMarkupToRef, revertRefToOriginal } from "../../src/lib/ai-studio/referenceEdits.ts";
import type { RefImage } from "../../src/lib/types/chatImage.ts";

test("applyMarkupToRef stores original on first edit", () => {
  const ref: RefImage = {
    id: "ref-1",
    name: "photo.jpg",
    path: "photo.jpg",
    mime: "image/jpeg",
    base64: "ORIGINAL",
  };

  const updated = applyMarkupToRef(ref, { base64: "EDITED", mime: "image/png" });

  assert.equal(updated.base64, "EDITED");
  assert.equal(updated.mime, "image/png");
  assert.equal(updated.originalBase64, "ORIGINAL");
  assert.equal(updated.originalMime, "image/jpeg");
});

test("applyMarkupToRef preserves original on subsequent edits", () => {
  const ref: RefImage = {
    id: "ref-2",
    name: "photo.jpg",
    path: "photo.jpg",
    mime: "image/png",
    base64: "EDITED-1",
    originalBase64: "ORIGINAL",
    originalMime: "image/jpeg",
  };

  const updated = applyMarkupToRef(ref, { base64: "EDITED-2", mime: "image/png" });

  assert.equal(updated.base64, "EDITED-2");
  assert.equal(updated.mime, "image/png");
  assert.equal(updated.originalBase64, "ORIGINAL");
  assert.equal(updated.originalMime, "image/jpeg");
});

test("revertRefToOriginal restores original and clears metadata", () => {
  const ref: RefImage = {
    id: "ref-3",
    name: "photo.jpg",
    path: "photo.jpg",
    mime: "image/png",
    base64: "EDITED",
    originalBase64: "ORIGINAL",
    originalMime: "image/jpeg",
  };

  const reverted = revertRefToOriginal(ref);

  assert.equal(reverted.base64, "ORIGINAL");
  assert.equal(reverted.mime, "image/jpeg");
  assert.equal(reverted.originalBase64, undefined);
  assert.equal(reverted.originalMime, undefined);
});

test("revertRefToOriginal no-ops when no original exists", () => {
  const ref: RefImage = {
    id: "ref-4",
    name: "photo.jpg",
    path: "photo.jpg",
    mime: "image/jpeg",
    base64: "ORIGINAL",
  };

  const reverted = revertRefToOriginal(ref);

  assert.deepEqual(reverted, ref);
});
