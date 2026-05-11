// Supabase Edge Function: brand-draft-voice
// Streams brandVoice via SSE using Gemini 1.5/2.0 Flash with RAG & URL Context

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSupabaseEdgeRequest } from "../_shared/supabase-edge-auth.ts";
import { encodeStructuredSseError } from "../_shared/sseError.ts";
import { streamGeminiTextDeltas, prefetchBrandContext } from "./geminiClient.ts";
import type { BrandContextSources } from "./geminiClient.ts";

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
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview"; // Use latest for tools
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";
  const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return { apiKey, model, baseUrl, geminiKey };
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
    const { apiKey, model, baseUrl, geminiKey } = getGeminiConfigFromEnv();

    // Supabase client for RPC
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const auth = await authorizeSupabaseEdgeRequest({
      authHeader: req.headers.get("Authorization"),
      getClaims: (accessToken) => supabase.auth.getClaims(accessToken),
    });
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      });
    }

    const abortController = new AbortController();
    req.signal?.addEventListener("abort", () => abortController.abort());

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
                  description: "Search uploaded brand guidelines or PDFs for context about voice, tone, or audience.",
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

          // Parallel pre-fetch: brand profile, competitors, and cross-table RAG
          const voiceQuery = "brand voice tone personality communication style guidelines";

          const [brandRow, competitors, ragContext] = await Promise.all([
            supabase
              .schema("brand_profiles")
              .from("brand_profiles")
              .select("brand_name, context")
              .eq("id", brandId)
              .maybeSingle()
              .then((r: any) => r.data ?? null),

            supabase
              .schema("brand_profiles")
              .from("brand_competitors")
              .select("name")
              .eq("brand_id", brandId)
              .then((r: any) => r.data ?? []),

            prefetchBrandContext(brandId, voiceQuery, geminiKey!, supabase),
          ]);

          const brandName = (brandRow as any)?.brand_name ?? "this brand";
          const brandMeta = (brandRow as any)?.context
            ? `\nBrand metadata: ${JSON.stringify((brandRow as any).context)}`
            : "";
          const competitorNames = ((competitors as any[]) ?? []).map((c: any) => c.name).filter(Boolean);
          const competitorLine = competitorNames.length
            ? `\nKnown competitors: ${competitorNames.join(", ")}`
            : "";

          const ragSections = [
            ragContext.documents && `## Brand Guidelines & Documents\n${ragContext.documents}`,
            ragContext.strategicAnalysis && `## Strategic Analysis\n${ragContext.strategicAnalysis}`,
            ragContext.trends && `## Relevant Trends\n${ragContext.trends}`,
            ragContext.questions && `## Audience Questions\n${ragContext.questions}`,
          ].filter(Boolean).join("\n\n");

          const systemInstruction =
            `You are a senior brand strategist defining the Brand Voice for ${brandName}.` +
            brandMeta +
            competitorLine +
            `\n\nWebsite to analyse: ${websiteUrl}` +
            (ragSections ? `\n\n${ragSections}` : "") +
            `\n\n## Your task\nAnalyse the website content, uploaded documents, and any strategic context above. Define the brand voice across these dimensions:\n` +
            `1. **Personality** — 5 adjectives. For each write one "We are [X], not [Y]" contrast.\n` +
            `2. **Tone** — How the brand modulates tone across contexts (celebratory, error, product detail, social).\n` +
            `3. **Vocabulary** — Sentence length tendency, technical vs plain language, active vs passive, signature phrases and words to avoid.\n` +
            `4. **Emotional register** — The primary emotion the brand aims to evoke.\n` +
            (competitorNames.length ? `5. **Differentiation** — How this voice contrasts with ${competitorNames.join(", ")}.\n` : "") +
            `\nBe specific — cite examples from the website or documents. Do not write generic brand strategy advice.\nLocale: ${locale || "en-US"}.`;

          const finalPrompt = `Analyse ${websiteUrl} and the provided context. Write the brand voice definition.`;

          // Call Gemini with Streaming
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
            geminiKey,
            groundingModel: model,
          });

          const reader = deltas.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              controller.enqueue(encoder.encode(sseEncode("brandVoice", JSON.stringify({ delta: value }))));
            }
          }

        } catch (error) {
          console.error("[brand-draft-voice]", { brandId, error: error instanceof Error ? error.message : String(error) });
          controller.enqueue(encoder.encode(sseEncode("error", encodeStructuredSseError(error))));
        } finally {
          controller.enqueue(encoder.encode(sseEncode("brandVoiceDone", "1")));
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
