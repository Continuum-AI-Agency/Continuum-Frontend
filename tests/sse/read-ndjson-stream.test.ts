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

test("readNdjsonStream splits concatenated JSON events without newline delimiters", async () => {
  const lines: string[] = [];
  const stream = streamFromChunks([
    '{"type":"response.sot_report","data":{"item_id":"item_1","part_id":"part_1","report":{"language":"en","executive_summary":"ok","performance_snapshot":[],"sections":[],"strategic_recommendations":[],"follow_up_questions":[],"handoff_trace":[],"cached_sources":[],"graphs":[]}}}',
    '{"type":"response.content_part.done","data":{"item_id":"item_1","part_id":"part_1"}}',
    '{"type":"response.output_item.done","data":{"item_id":"item_1"}}{"type":"response.done","data":{"id":"resp_1","object":"realtime.response","status":"completed","status_details":null,"output":[]}}',
  ]);

  await readNdjsonStream({
    reader: stream.getReader(),
    onLine: (line) => lines.push(line),
  });

  const eventTypes = lines.map((line) => {
    const parsed = JSON.parse(line) as { type?: string };
    return parsed.type;
  });

  assert.deepEqual(eventTypes, [
    "response.sot_report",
    "response.content_part.done",
    "response.output_item.done",
    "response.done",
  ]);
});
