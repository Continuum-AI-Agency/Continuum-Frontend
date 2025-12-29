import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeCreativeAssetUrl } from "../../src/lib/creative-assets/assetUrl";

test("sanitizeCreativeAssetUrl returns null for empty or relative paths", () => {
  assert.equal(sanitizeCreativeAssetUrl(null), null);
  assert.equal(sanitizeCreativeAssetUrl(undefined), null);
  assert.equal(sanitizeCreativeAssetUrl(""), null);
  assert.equal(sanitizeCreativeAssetUrl("  "), null);
  assert.equal(sanitizeCreativeAssetUrl("branding/logo.png"), null);
  assert.equal(sanitizeCreativeAssetUrl("/branding/logo.png"), null);
});

test("sanitizeCreativeAssetUrl keeps absolute, data, and blob urls", () => {
  assert.equal(
    sanitizeCreativeAssetUrl("https://cdn.example.com/assets/logo.png"),
    "https://cdn.example.com/assets/logo.png"
  );
  assert.equal(
    sanitizeCreativeAssetUrl("http://cdn.example.com/assets/logo.png"),
    "http://cdn.example.com/assets/logo.png"
  );
  assert.equal(
    sanitizeCreativeAssetUrl("data:image/png;base64,AAA"),
    "data:image/png;base64,AAA"
  );
  assert.equal(
    sanitizeCreativeAssetUrl("blob:https://app.trycontinuum.ai/asset-id"),
    "blob:https://app.trycontinuum.ai/asset-id"
  );
});
