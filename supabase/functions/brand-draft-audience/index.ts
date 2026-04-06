// Supabase Edge Function: brand-draft-audience

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamGeminiTextDeltas } from "./geminiClient.ts";

type DraftRequest = {
  brandId: string;
  websiteUrl: string;
  locale?: string;
};

function sseEncode(event: string, data: string): string {
  return `event: ${event}\n` + data.split("\n").map((line) => `data: ${line}`).join("\n") + "\n\n";
}

function getGeminiConfigFromEnv() {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return { apiKey, model, baseUrl };
}

// --- Main Handler ---

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

  try {
    const payload: DraftRequest = await req.json();
    if (!payload?.brandId || !payload?.websiteUrl) {
      throw new Error("Missing brandId or websiteUrl");
    }

    const { websiteUrl, brandId, locale } = payload;
    const { apiKey, model, baseUrl } = getGeminiConfigFromEnv();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(sseEncode("ready", "1")));

        try {
          const tools = [
            {
              functionDeclarations: [
                {
                  name: "search_brand_documents",
                  description: "Search uploaded brand guidelines or PDFs for context about audience, personas, or customer demographics.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      query: { type: "STRING", description: "Search query" },
                    },
                    required: ["query"],
                  },
                },
              ],
            },
          ];

          const systemInstruction =
            `You are an expert brand strategist. Goal: Define the Target Audience & Customer Personas. ` +
            `1. Analyze the website: ${websiteUrl}. ` +
            `2. If the website is sparse, SEARCH the uploaded documents for "Target Audience" or "Customer Personas". ` +
            `3. Output 2-3 sentences plus bullet segments (3-5). ` +
            `Locale: ${locale || "en-US"}.`;

          const finalPrompt = `Website: ${websiteUrl}\n\nInstruction: Derive the target audience and customer personas.`;

          const abortController = new AbortController();
          req.signal?.addEventListener("abort", () => abortController.abort());

          const deltas = await streamGeminiTextDeltas({
            apiKey,
            baseUrl,
            model,
            systemInstruction,
            input: finalPrompt,
            signal: abortController.signal,
            tools,
            brandId,
            supabase,
            geminiKey: apiKey,
            groundingModel: model,
          });

          const reader = deltas.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              controller.enqueue(encoder.encode(sseEncode("targetAudience", JSON.stringify({ delta: value }))));
            }
          }

        } catch (error) {
          console.error(error);
          controller.enqueue(encoder.encode(sseEncode("error", String(error))));
        } finally {
          controller.enqueue(encoder.encode(sseEncode("targetAudienceDone", "1")));
          controller.enqueue(encoder.encode(sseEncode("done", "1")));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
