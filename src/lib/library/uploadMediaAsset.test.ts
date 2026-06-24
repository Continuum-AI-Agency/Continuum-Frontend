import { describe, expect, it } from "bun:test"

import { uploadMediaAsset } from "./uploadMediaAsset"

type InvokeResult = { data?: unknown; error?: unknown }

interface FakeClientOptions {
  sign?: InvokeResult
  upload?: { error?: unknown }
  register?: InvokeResult
  calls: string[]
}

const VALID_TICKET = {
  bucket: "media-library",
  path: "b1/asset-1/photo.png",
  token: "signed-token",
  assetId: "asset-1",
}

const VALID_REGISTER = {
  ok: true,
  status: "ready",
  assetId: "asset-1",
  storagePath: "b1/asset-1/photo.png",
  signedUrl: "https://signed.example/photo.png",
}

function makeClient(opts: FakeClientOptions) {
  const client = {
    functions: {
      invoke: async (_name: string, args: { body: Record<string, unknown> }) => {
        const action = args.body.action
        opts.calls.push(`invoke:${String(action)}`)
        if (action === "sign_upload") return opts.sign ?? { data: VALID_TICKET, error: null }
        if (action === "register") return opts.register ?? { data: VALID_REGISTER, error: null }
        return { data: null, error: null }
      },
    },
    storage: {
      from: (_bucket: string) => ({
        uploadToSignedUrl: async () => {
          opts.calls.push("uploadToSignedUrl")
          return opts.upload ?? { error: null }
        },
      }),
    },
  }
  return client as unknown as ReturnType<typeof import("@/lib/supabase/client").createSupabaseBrowserClient>
}

function pngFile(): File {
  return new File(["pixels"], "photo.png", { type: "image/png" })
}

describe("uploadMediaAsset", () => {
  it("signs, uploads, then registers in order and returns the asset coordinates", async () => {
    const calls: string[] = []
    const client = makeClient({ calls })

    const result = await uploadMediaAsset({ file: pngFile(), brandId: "b1" }, { createClient: () => client })

    expect(calls).toEqual(["invoke:sign_upload", "uploadToSignedUrl", "invoke:register"])
    expect(result).toEqual({
      assetId: "asset-1",
      storagePath: "b1/asset-1/photo.png",
      signedUrl: "https://signed.example/photo.png",
    })
  })

  it("throws when the sign response is not a valid ticket", async () => {
    const calls: string[] = []
    const client = makeClient({ calls, sign: { data: { bucket: "media-library" }, error: null } })

    await expect(uploadMediaAsset({ file: pngFile(), brandId: "b1" }, { createClient: () => client })).rejects.toThrow(
      "invalid upload ticket",
    )
    expect(calls).toEqual(["invoke:sign_upload"])
  })

  it("surfaces the edge fn's structured error message from a non-2xx register", async () => {
    const calls: string[] = []
    const context = new Response(
      JSON.stringify({ ok: false, status: "error", message: "DB insert failed: boom" }),
      { status: 500 },
    )
    const client = makeClient({
      calls,
      register: { data: null, error: { message: "Edge Function returned a non-2xx status code", context } },
    })

    await expect(uploadMediaAsset({ file: pngFile(), brandId: "b1" }, { createClient: () => client })).rejects.toThrow(
      "DB insert failed: boom",
    )
  })

  it("throws when the direct storage upload fails", async () => {
    const calls: string[] = []
    const client = makeClient({ calls, upload: { error: { message: "signature expired" } } })

    await expect(uploadMediaAsset({ file: pngFile(), brandId: "b1" }, { createClient: () => client })).rejects.toThrow(
      "upload to storage failed: signature expired",
    )
    expect(calls).toEqual(["invoke:sign_upload", "uploadToSignedUrl"])
  })
})
