// Supabase Edge Function: prompt-fast-enrich
// Streams enriched prompt via SSE.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractGeminiChunkText } from "../brand-draft-voice/geminiStream.ts";

type EnrichRequest = {
  prompt: string;
  brandId?: string;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  ...CORS_HEADERS,
};

const FAST_ENRICH_TIMEOUT_MS = 25_000;

function sseEncode(event: string, data: string): string {
  return `event: ${event}\n` + data.split("\n").map((line) => `data: ${line}`).join("\n") + "\n\n";
}

function logInfo(message: string, context: Record<string, unknown> = {}) {
  console.info("[prompt-fast-enrich]", JSON.stringify({ level: "info", message, ...context }));
}

function logWarn(message: string, context: Record<string, unknown> = {}) {
  console.warn("[prompt-fast-enrich]", JSON.stringify({ level: "warn", message, ...context }));
}

function logError(message: string, context: Record<string, unknown> = {}) {
  console.error("[prompt-fast-enrich]", JSON.stringify({ level: "error", message, ...context }));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function getGeminiConfigFromEnv(): { apiKey: string; model: string; baseUrl: string } {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return { apiKey, model, baseUrl };
}

async function createGeminiDeltaStream({
  apiKey,
  model,
  baseUrl,
  systemInstruction,
  input,
  signal,
  requestId,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemInstruction: string;
  input: string;
  signal: AbortSignal;
  requestId: string;
}): Promise<ReadableStream<string>> {
  const url = new URL(`/v1beta/models/${model}:streamGenerateContent`, baseUrl);
  url.searchParams.set("alt", "sse");

  const requestBody = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1200,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Gemini API error ${response.status}${details ? `: ${details}` : ""}`);
  }
  if (!response.body) {
    throw new Error("Gemini stream missing response body");
  }

  logInfo("gemini_stream_connected", { requestId, model });

  const sourceReader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<string>({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await sourceReader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = extractGeminiChunkText(parsed);
              if (delta) controller.enqueue(delta);
            } catch {
              logWarn("failed_to_parse_gemini_sse_line", { requestId, linePrefix: line.slice(0, 80) });
            }
          }
        }
      } finally {
        try {
          sourceReader.releaseLock();
        } catch {
          // best-effort
        }
        controller.close();
      }
    },
    cancel(reason) {
      sourceReader.cancel(reason).catch(() => {});
    },
  });
}

serve(async (req: Request) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", requestId }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  let payload: EnrichRequest | null = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON", requestId }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const prompt = payload?.prompt?.trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt", requestId }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const systemInstruction =
    "You are an expert prompt engineer. Expand short prompts into high-quality generation prompts. " +
    "Add concrete details for subject, style, lighting, composition, camera, and mood while preserving user intent. " +
    "Return only the enriched prompt text.";
  const input = `Original Prompt: ${prompt}\n\nEnriched Prompt:`;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort("timeout"), FAST_ENRICH_TIMEOUT_MS);
  const encoder = new TextEncoder();

  let config: { apiKey: string; model: string; baseUrl: string };
  try {
    config = getGeminiConfigFromEnv();
  } catch (error) {
    clearTimeout(timeout);
    const message = getErrorMessage(error);
    logError("config_error", { requestId, message });
    return new Response(JSON.stringify({ error: message, requestId }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  try {
    const deltaStream = await createGeminiDeltaStream({
      ...config,
      systemInstruction,
      input,
      signal: abortController.signal,
      requestId,
    });
    const reader = deltaStream.getReader();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let streamedCharacters = 0;
        try {
          controller.enqueue(encoder.encode(sseEncode("ready", JSON.stringify({ requestId }))));

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;

            streamedCharacters += value.length;
            controller.enqueue(encoder.encode(sseEncode("delta", JSON.stringify({ delta: value }))));
          }

          logInfo("stream_complete", {
            requestId,
            promptLength: prompt.length,
            streamedCharacters,
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          const message = getErrorMessage(error);
          logError("stream_error", { requestId, message, durationMs: Date.now() - startedAt });
          try {
            controller.enqueue(
              encoder.encode(sseEncode("error", JSON.stringify({ message, requestId }))),
            );
          } catch {
            // stream already closed/cancelled
          }
        } finally {
          clearTimeout(timeout);
          try {
            controller.enqueue(encoder.encode(sseEncode("done", JSON.stringify({ requestId }))));
          } catch {
            // stream already closed/cancelled
          }
          try {
            controller.close();
          } catch {
            // stream already closed/cancelled
          }
          try {
            reader.releaseLock();
          } catch {
            // best-effort
          }
        }
      },
      cancel(reason) {
        clearTimeout(timeout);
        abortController.abort(reason);
        reader.cancel(reason).catch(() => {});
      },
    });

    logInfo("request_started", {
      requestId,
      model: config.model,
      promptLength: prompt.length,
      brandId: payload?.brandId || null,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = getErrorMessage(error);
    logError("request_failed_before_stream", {
      requestId,
      message,
      durationMs: Date.now() - startedAt,
    });
    return new Response(JSON.stringify({ error: message, requestId }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
