import test from "node:test";
import assert from "node:assert/strict";

import type { CreativeAsset } from "../../src/lib/creative-assets/types";
import { resolveCreativeAssetDownloadUrl } from "../../src/lib/creative-assets/download";

test("resolveCreativeAssetDownloadUrl uses signed download urls for private buckets", async () => {
  const calls: Array<{ fullPath: string; expiresInSeconds: number; fileName: string }> = [];

  const asset: CreativeAsset = {
    id: "1",
    kind: "file",
    name: "example.png",
    path: "brand/",
    fullPath: "brand/example.png",
    size: 1,
    updatedAt: null,
    contentType: "image/png",
  };

  const url = await resolveCreativeAssetDownloadUrl(asset, {
    expiresInSeconds: 123,
    dependencies: {
      isPublicBucket: () => false,
      createSignedDownloadUrl: async (fullPath, expiresInSeconds, fileName) => {
        calls.push({ fullPath, expiresInSeconds, fileName });
        return "signed-url";
      },
      getPublicAssetDownloadUrl: async () => {
        throw new Error("unexpected public url call");
      },
    },
  });

  assert.equal(url, "signed-url");
  assert.deepEqual(calls, [{ fullPath: asset.fullPath, expiresInSeconds: 123, fileName: asset.name }]);
});

test("resolveCreativeAssetDownloadUrl uses public download urls for public buckets", async () => {
  const calls: Array<{ fullPath: string; fileName: string }> = [];

  const asset: CreativeAsset = {
    id: "1",
    kind: "file",
    name: "example.mp4",
    path: "brand/",
    fullPath: "brand/example.mp4",
    size: 1,
    updatedAt: null,
    contentType: "video/mp4",
  };

  const url = await resolveCreativeAssetDownloadUrl(asset, {
    dependencies: {
      isPublicBucket: () => true,
      createSignedDownloadUrl: async () => {
        throw new Error("unexpected signed url call");
      },
      getPublicAssetDownloadUrl: async (fullPath, fileName) => {
        calls.push({ fullPath, fileName });
        return "public-url";
      },
    },
  });

  assert.equal(url, "public-url");
  assert.deepEqual(calls, [{ fullPath: asset.fullPath, fileName: asset.name }]);
});

test("resolveCreativeAssetDownloadUrl rejects folder assets", async () => {
  const folder: CreativeAsset = {
    id: "folder",
    kind: "folder",
    name: "folder",
    path: "brand/",
    fullPath: "brand/folder",
    size: null,
    updatedAt: null,
    contentType: null,
  };

  await assert.rejects(() => resolveCreativeAssetDownloadUrl(folder), /Cannot download non-file asset/);
});

