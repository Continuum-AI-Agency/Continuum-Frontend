// Supabase Edge Function: brand-draft-voice
// Streams brandVoice via SSE using Gemini

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { streamGeminiTextDeltas } from "./geminiClient.ts";

type DraftRequest = {
  brandId: string;
  websiteUrl: string;
  locale?: string;
};

function sseEncode(event: string, data: string): string {
  return `event: ${event}\n` + data.split("\n").map((line) => `data: ${line}`).join("\n") + "\n\n";
}

function getGeminiConfigFromEnv(): { apiKey: string; model: string; baseUrl: string } {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
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

  let payload: DraftRequest | null = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!payload?.brandId || !payload?.websiteUrl) {
    return new Response(JSON.stringify({ error: "Missing brandId or websiteUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { websiteUrl, locale } = payload;
  const lc = (locale || "en-US").slice(0, 5);

  const systemInstruction =
    `You are drafting a concise brand voice summary using the website as primary source. ` +
    `Output brief, actionable tone guidance; 2-3 sentences plus 5-8 adjectives. Locale: ${lc}.`;
  const input = `Website: ${websiteUrl}\nInstruction: Derive brand voice.`;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort("timeout"), 25_000);

  const { apiKey, model, baseUrl } = getGeminiConfigFromEnv();
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
      controller.enqueue(encoder.encode(sseEncode("ready", "1")));
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          controller.enqueue(encoder.encode(sseEncode("brandVoice", JSON.stringify({ delta: value }))));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(sseEncode("error", (error as Error).message)));
      } finally {
        clearTimeout(timeout);
        controller.enqueue(encoder.encode(sseEncode("brandVoiceDone", "1")));
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
});
