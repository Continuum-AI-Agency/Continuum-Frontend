// Supabase Edge Function: brand-draft-audience

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

          const abortController = new AbortController();
          req.signal?.addEventListener("abort", () => abortController.abort());

          // Parallel pre-fetch: brand profile, competitors, and cross-table RAG
          const audienceQuery = "target audience customer personas demographics segments motivations";

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

            prefetchBrandContext(brandId, audienceQuery, apiKey, supabase),
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
            ragContext.questions && `## Customer Questions\n${ragContext.questions}`,
            ragContext.events && `## Relevant Events\n${ragContext.events}`,
          ].filter(Boolean).join("\n\n");

          const systemInstruction =
            `You are a senior brand strategist defining the Target Audience & Customer Personas for ${brandName}.` +
            brandMeta +
            competitorLine +
            `\n\nWebsite to analyse: ${websiteUrl}` +
            (ragSections ? `\n\n${ragSections}` : "") +
            `\n\n## Your task\nAnalyse the website, uploaded documents, customer questions, and trends above. Define the audience across these dimensions:\n` +
            `1. **Primary segment** — Demographics, geography, income, job role.\n` +
            `2. **Psychographics** — Values, beliefs, lifestyle, identity.\n` +
            `3. **Pain points** — The 3 core problems this brand solves for them.\n` +
            `4. **Buying motivations** — What triggers them to purchase. Rational and emotional.\n` +
            `5. **Platform behaviour** — Where they spend time and what content they engage with.\n` +
            (competitorNames.length ? `6. **Why they choose ${brandName} over ${competitorNames[0]}** — What differentiates.\n` : "") +
            `\nBe specific. Use evidence from the sources above. If customer questions are present, treat them as direct audience signal.\nLocale: ${locale || "en-US"}.`;

          const finalPrompt = `Analyse ${websiteUrl} and the provided context. Write the target audience and persona profiles.`;

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
          console.error("[brand-draft-audience]", { brandId, error: error instanceof Error ? error.message : String(error) });
          controller.enqueue(encoder.encode(sseEncode("error", encodeStructuredSseError(error))));
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
