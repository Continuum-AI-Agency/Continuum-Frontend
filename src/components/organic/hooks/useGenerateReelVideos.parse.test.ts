import { describe, expect, it } from "bun:test"

import { parseNdjson } from "./useGenerateReelVideos"

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]))
        i += 1
      } else {
        controller.close()
      }
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const frame of parseNdjson(stream)) out.push(frame)
  return out
}

describe("parseNdjson", () => {
  it("parses whole lines split across chunk boundaries", async () => {
    // The "reel_st" / "arted" boundary splits a JSON object mid-line.
    const frames = await collect(
      streamFromChunks([
        '{"type":"batch_started","total":1}\n{"type":"reel_st',
        'arted","draftId":"d1"}\n',
        '{"type":"batch_completed","ready":1,"failed":0}\n',
      ]),
    )
    expect(frames).toEqual([
      { type: "batch_started", total: 1 },
      { type: "reel_started", draftId: "d1" },
      { type: "batch_completed", ready: 1, failed: 0 },
    ])
  })

  it("emits a trailing line with no final newline", async () => {
    const frames = await collect(streamFromChunks(['{"type":"reel_failed","draftId":"d2","error":"x"}']))
    expect(frames).toEqual([{ type: "reel_failed", draftId: "d2", error: "x" }])
  })

  it("skips blank and malformed lines", async () => {
    const frames = await collect(
      streamFromChunks(['\n{"type":"reel_started","draftId":"d1"}\nnot-json\n\n']),
    )
    expect(frames).toEqual([{ type: "reel_started", draftId: "d1" }])
  })
})
