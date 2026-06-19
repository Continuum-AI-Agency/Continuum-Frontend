import { describe, it, expect, mock } from "bun:test"

import { mediaAssetSchema } from "@continuum/contracts"
import { uploadDraftCreative, uploadDraftCreatives } from "./uploadDraftCreative"

const makeFile = (name = "photo.jpg", type = "image/jpeg") =>
  new File([new Uint8Array([1, 2, 3])], name, { type })

const okUpload = async (_file: File) => ({ assetId: "asset-1", storagePath: "brand-1/asset-1/photo.jpg" })
const okSign = async () => ({ signedUrl: "https://signed/url" })

describe("uploadDraftCreative", () => {
  it("uploads, signs, and returns a schema-valid MediaAsset", async () => {
    const onStatus = mock((_status: string, _index: number) => {})
    const asset = await uploadDraftCreative(
      { file: makeFile(), brandId: "brand-1" },
      { upload: okUpload, sign: okSign, onStatus },
    )
    expect(asset).not.toBeNull()
    expect(() => mediaAssetSchema.parse(asset)).not.toThrow()
    expect(asset?.id).toBe("asset-1")
    expect(asset?.bucket).toBe("media-library")
    expect(asset?.kind).toBe("image")
    expect(asset?.source).toBe("upload")
    expect(asset?.signedUrl).toBe("https://signed/url")
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(["processing", "ready"])
  })

  it("derives video kind from the file mime type", async () => {
    const asset = await uploadDraftCreative(
      { file: makeFile("clip.mp4", "video/mp4"), brandId: "brand-1" },
      { upload: okUpload, sign: okSign },
    )
    expect(asset?.kind).toBe("video")
  })

  it("returns null and reports error when the upload fails", async () => {
    const onStatus = mock((_status: string, _index: number) => {})
    const failUpload = async () => {
      throw new Error("upload 500")
    }
    const asset = await uploadDraftCreative(
      { file: makeFile(), brandId: "brand-1" },
      { upload: failUpload, sign: okSign, onStatus },
    )
    expect(asset).toBeNull()
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(["processing", "error"])
  })
})

describe("uploadDraftCreatives", () => {
  it("preserves selection order and drops failures", async () => {
    let n = 0
    const upload = async (file: File) => {
      if (file.name === "bad.jpg") throw new Error("fail")
      n += 1
      return { assetId: `asset-${n}`, storagePath: `brand-1/asset-${n}/${file.name}` }
    }
    const files = [makeFile("a.jpg"), makeFile("bad.jpg"), makeFile("c.jpg")]
    const assets = await uploadDraftCreatives({ files, brandId: "brand-1" }, { upload, sign: okSign })
    expect(assets.map((a) => a.fileName)).toEqual(["a.jpg", "c.jpg"])
  })
})
