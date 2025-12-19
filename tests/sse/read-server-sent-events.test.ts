import test from "node:test";
import assert from "node:assert/strict";

import { readServerSentEvents } from "../../src/lib/sse/readServerSentEvents";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test("parses event and data lines into complete events", async () => {
  const events: Array<{ eventName: string | null; data: string }> = [];
  const stream = streamFromChunks([
    "event: brandVoice\n",
    "data: {\"delta\":\"Hi\"}\n",
    "\n",
    "event: brandVoiceDone\n",
    "data: 1\n\n",
  ]);

  await readServerSentEvents({
    reader: stream.getReader(),
    onEvent: (eventName, data) => events.push({ eventName, data }),
  });

  assert.deepEqual(events, [
    { eventName: "brandVoice", data: " {\"delta\":\"Hi\"}" },
    { eventName: "brandVoiceDone", data: " 1" },
  ]);
});

test("handles multi-line data payloads and chunk boundaries", async () => {
  const events: Array<{ eventName: string | null; data: string }> = [];
  const stream = streamFromChunks([
    "event: message\n",
    "data: first\n",
    "data: second\n",
    "\n",
    "event: other\n",
    "data: {\"a\":1}",
    "\n\n",
  ]);

  await readServerSentEvents({
    reader: stream.getReader(),
    onEvent: (eventName, data) => events.push({ eventName, data }),
  });

  assert.deepEqual(events, [
    { eventName: "message", data: " first\n second" },
    { eventName: "other", data: " {\"a\":1}" },
  ]);
});

