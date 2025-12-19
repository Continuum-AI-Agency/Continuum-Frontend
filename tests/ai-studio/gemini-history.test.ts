import test from "node:test";
import assert from "node:assert/strict";

import { toBackendGeminiHistory } from "../../src/lib/ai-studio/geminiHistory";

test("maps conversation turns to gemini history parts", () => {
  const result = toBackendGeminiHistory([
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there" },
  ]);

  assert.deepEqual(result, [
    { role: "user", parts: [{ text: "Hello" }] },
    { role: "model", parts: [{ text: "Hi there" }] },
  ]);
});

test("filters empty turns and trims content", () => {
  const result = toBackendGeminiHistory([
    { role: "user", content: "   " },
    { role: "assistant", content: "\nOK\n" },
  ]);

  assert.deepEqual(result, [{ role: "model", parts: [{ text: "OK" }] }]);
});

