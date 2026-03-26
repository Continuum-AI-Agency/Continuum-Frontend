import { describe, expect, it, spyOn } from "bun:test";

import { streamJainaSpeechToText } from "./speech";

function createSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("streamJainaSpeechToText", () => {
  it("accumulates transcript deltas and respects transcript.done payload", async () => {
    const fetchMock = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          createSseStream([
            "event: ready\ndata: {\"chunkCount\":2}\n\n",
            "event: transcript.delta\ndata: {\"delta\":\"Hello there\"}\n\n",
            "event: transcript.delta\ndata: {\"delta\":\"general Kenobi\"}\n\n",
            "event: transcript.done\ndata: {\"transcript\":\"Hello there general Kenobi\"}\n\n",
            "event: done\ndata: 1\n\n",
          ]),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }
        )
      );

    const deltas: string[] = [];
    const transcript = await streamJainaSpeechToText({
      audioBlob: new Blob(["audio-bytes"], { type: "audio/webm" }),
      onDelta: (delta) => deltas.push(delta),
    });

    expect(transcript).toBe("Hello there general Kenobi");
    expect(deltas).toEqual(["Hello there", "general Kenobi"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/jaina/speech/stream",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("throws when transcription endpoint fails", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Nope" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      streamJainaSpeechToText({
        audioBlob: new Blob(["audio-bytes"], { type: "audio/webm" }),
      })
    ).rejects.toThrow("Nope");
  });
});
