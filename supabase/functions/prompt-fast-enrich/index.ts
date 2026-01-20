// Supabase Edge Function: prompt-fast-enrich
// Streams enriched prompt via SSE using Gemini 3 Flash Preview

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { streamGeminiTextDeltas } from "../brand-draft-voice/geminiClient.ts";

type EnrichRequest = {
  prompt: string;
  brandId?: string;
};

function sseEncode(event: string, data: string): string {
  return `event: ${event}\n` + data.split("\n").map((line) => `data: ${line}`).join("\n") + "\n\n";
}

function getGeminiConfigFromEnv(): { apiKey: string; model: string; baseUrl: string } {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is not set");
    throw new Error("Missing GEMINI_API_KEY - please set it using: supabase secrets set GEMINI_API_KEY=your_key_here");
  }
  return { apiKey, model, baseUrl };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: EnrichRequest | null = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!payload?.prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { prompt } = payload;

  const systemInstruction =
    "You are an expert prompt engineer. Your task is to take a simple, short user prompt and expand it into a high-quality, " +
    "descriptive, and effective AI generation prompt. Focus on adding detail, style, lighting, and composition while preserving " +
    "the original intent. Output ONLY the enriched prompt text. Be concise but descriptive.";
    
  const input = `Original Prompt: ${prompt}\n\nEnriched Prompt:`;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort("timeout"), 25_000);

  const { apiKey, model, baseUrl } = getGeminiConfigFromEnv();
  
  try {
    const deltas = await streamGeminiTextDeltas({
      apiKey,
      baseUrl,
      model,
      systemInstruction,
      input,
      signal: abort.signal,
    });

    const reader = deltas.getReader();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            controller.enqueue(encoder.encode(sseEncode("delta", JSON.stringify({ delta: value }))));
          }
        } catch (error) {
          controller.enqueue(encoder.encode(sseEncode("error", (error as Error).message)));
        } finally {
          clearTimeout(timeout);
          controller.enqueue(encoder.encode(sseEncode("done", "1")));
          controller.close();
        }
      },
      cancel() {
        try {
          reader.cancel();
        } catch {
          // best-effort
        }
        abort.abort("cancelled");
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
