import test from "node:test";
import assert from "node:assert/strict";

import { readNdjsonStream } from "../../src/lib/streaming/readNdjsonStream";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test("readNdjsonStream emits trimmed non-empty lines", async () => {
  const lines: string[] = [];
  const stream = streamFromChunks(["first\nsecond\n", "\nthird"]);

  await readNdjsonStream({
    reader: stream.getReader(),
    onLine: (line) => lines.push(line),
  });

  assert.deepEqual(lines, ["first", "second", "third"]);
});
