import { computeTextDelta, extractGeminiChunkText } from "./geminiStream.ts";

export type GeminiStreamRequest = {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemInstruction: string;
  input: string;
  signal: AbortSignal;
};

export type GeminiRequestToolsMode = "url_context_and_search" | "search_only" | "none";

export async function streamGeminiTextDeltas({
  apiKey,
  baseUrl,
  model,
  systemInstruction,
  input,
  signal,
}: GeminiStreamRequest): Promise<ReadableStream<string>> {
  const response = await postStreamGenerateContent({
    apiKey,
    baseUrl,
    model,
    requestBody: buildGeminiStreamGenerateContentRequestBody({ systemInstruction, input, toolsMode: "url_context_and_search" }),
    signal,
  }).catch(async () => {
    return await postStreamGenerateContent({
      apiKey,
      baseUrl,
      model,
      requestBody: buildGeminiStreamGenerateContentRequestBody({ systemInstruction, input, toolsMode: "search_only" }),
      signal,
    }).catch(async () => {
      return await postStreamGenerateContent({
        apiKey,
        baseUrl,
        model,
        requestBody: buildGeminiStreamGenerateContentRequestBody({ systemInstruction, input, toolsMode: "none" }),
        signal,
      });
    });
  });

  if (!response.body) throw new Error("Gemini API error: missing body");

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let accumulatedText = "";

  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      if (!value) return;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let chunk: unknown;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        const chunkText = extractGeminiChunkText(chunk);
        const { nextText, delta } = computeTextDelta(accumulatedText, chunkText);
        accumulatedText = nextText;

        if (delta) controller.enqueue(delta);
      }
    },
    cancel() {
      try {
        reader.cancel();
      } catch {
        // best-effort
      }
    },
  });
}

async function postStreamGenerateContent({
  apiKey,
  baseUrl,
  model,
  requestBody,
  signal,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestBody: unknown;
  signal: AbortSignal;
}): Promise<Response> {
  const url = new URL(`/v1beta/models/${model}:streamGenerateContent`, baseUrl);
  url.searchParams.set("alt", "sse");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (response.ok) return response;

  let details = `${response.status}`;
  try {
    const errorText = await response.text();
    if (errorText) details += ` ${errorText}`;
  } catch {
    // ignore
  }
  throw new Error(`Gemini API error: ${details}`.trim());
}

export function buildGeminiStreamGenerateContentRequestBody({
  systemInstruction,
  input,
  toolsMode,
}: {
  systemInstruction: string;
  input: string;
  toolsMode: GeminiRequestToolsMode;
}) {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200,
    },
  };

  if (toolsMode === "url_context_and_search") body.tools = [{ url_context: {} }, { google_search: {} }];
  if (toolsMode === "search_only") body.tools = [{ google_search: {} }];
  return body;
}

