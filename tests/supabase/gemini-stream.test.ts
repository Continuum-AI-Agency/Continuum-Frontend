import test from "node:test";
import assert from "node:assert/strict";

import { computeTextDelta, extractGeminiChunkText } from "../../supabase/functions/brand-draft-voice/geminiStream";
import { buildGeminiStreamGenerateContentRequestBody } from "../../supabase/functions/brand-draft-voice/geminiClient";

test("extractGeminiChunkText returns empty string when no candidates", () => {
  assert.equal(extractGeminiChunkText({}), "");
});

test("extractGeminiChunkText extracts concatenated text parts", () => {
  const chunk = {
    candidates: [
      {
        content: {
          parts: [{ text: "Hello" }, { text: " " }, { text: "world" }],
        },
      },
    ],
  };

  assert.equal(extractGeminiChunkText(chunk), "Hello world");
});

test("extractGeminiChunkText supports array-wrapped chunks", () => {
  const chunk = [
    {
      candidates: [{ content: { parts: [{ text: "A" }] } }],
    },
  ];

  assert.equal(extractGeminiChunkText(chunk), "A");
});

test("computeTextDelta treats chunk as cumulative when prefixed", () => {
  const result = computeTextDelta("Hello", "Hello world");
  assert.deepEqual(result, { nextText: "Hello world", delta: " world" });
});

test("computeTextDelta treats chunk as delta when not prefixed", () => {
  const result = computeTextDelta("Hello", " world");
  assert.deepEqual(result, { nextText: "Hello world", delta: " world" });
});

test("buildGeminiStreamGenerateContentRequestBody uses systemInstruction and tools", () => {
  const body = buildGeminiStreamGenerateContentRequestBody({
    systemInstruction: "System",
    input: "Website: https://example.com",
    toolsMode: "url_context_and_search",
  }) as Record<string, unknown>;

  assert.equal(typeof body.systemInstruction, "object");
  assert.equal("system_instruction" in body, false);

  assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: "Website: https://example.com" }] }]);
  assert.deepEqual(body.tools, [{ url_context: {} }, { google_search: {} }]);
});

test("buildGeminiStreamGenerateContentRequestBody omits tools when toolsMode is none", () => {
  const body = buildGeminiStreamGenerateContentRequestBody({
    systemInstruction: "System",
    input: "Hello",
    toolsMode: "none",
  }) as Record<string, unknown>;

  assert.equal("tools" in body, false);
});
