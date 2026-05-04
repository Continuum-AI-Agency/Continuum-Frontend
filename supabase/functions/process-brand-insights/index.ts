/// <reference types="https://deno.land/x/deno/cli/types/v8.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.29.2";
import { authorizeSupabaseEdgeRequest } from "../_shared/supabase-edge-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TrendData {
  title: string;
  description?: string;
  relevance_to_brand?: string;
  source?: string;
}

interface EventData {
  title: string;
  date?: string;
  description?: string;
  opportunity?: string;
}

interface QuestionData {
  question: string;
  content_type_suggestion?: string;
  why_relevant?: string;
  social_platform?: string;
}

interface NicheQuestions {
  questions?: QuestionData[];
  [key: string]: unknown;
}

interface InsightsData {
  brand_id: string;
  country?: string;
  week_start_date: string;
  trends_and_events?: {
    trends?: TrendData[];
    events?: EventData[];
  };
  questions_by_niche?: Record<string, NicheQuestions>;
  selected_social_platforms?: string[];
}

interface EntityCounts {
  total: number;
  failed: number;
}

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateEnv(): string | null {
  for (const key of requiredEnv) {
    if (!Deno.env.get(key)) {
      return key;
    }
  }
  return null;
}

function validatePayload(body: unknown): { ok: true; data: InsightsData } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload must be an object." };
  }
  const { brand_id, generation_data } = body as Record<string, unknown>;
  if (!generation_data || !brand_id) {
    return { ok: false, error: "brand_id and generation_data are required." };
  }
  const gen = generation_data as Record<string, unknown>;
  if (typeof gen.week_start_date !== "string") {
    return { ok: false, error: "week_start_date is required." };
  }
  if (gen.trends_and_events && typeof gen.trends_and_events !== "object") {
    return { ok: false, error: "trends_and_events must be an object." };
  }
  if (gen.questions_by_niche && typeof gen.questions_by_niche !== "object") {
    return { ok: false, error: "questions_by_niche must be an object." };
  }

  const data: InsightsData = {
    ...(gen as Omit<InsightsData, "brand_id">),
    brand_id: brand_id as string,
  };
  return { ok: true, data };
}

async function embedBatch(texts: string[], openai: OpenAI, concurrency = 10): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const batch = await Promise.all(
      slice.map((text) => {
        const cleaned = (text || "").trim();
        if (!cleaned) return Promise.resolve(null);
        return openai.embeddings
          .create({ model: "text-embedding-3-small", input: cleaned })
          .then((r) => r.data[0]?.embedding ?? null)
          .catch(() => null);
      })
    );
    batch.forEach((v, j) => { results[i + j] = v; });
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const missingEnv = validateEnv();
  if (missingEnv) {
    return jsonResponse({ error: `Missing env ${missingEnv}` }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const auth = await authorizeSupabaseEdgeRequest({
    authHeader: req.headers.get("Authorization"),
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    allowServiceRole: true,
    getClaims: (accessToken) => supabase.auth.getClaims(accessToken),
  });
  if (!auth.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

  try {
    const body = await req.json();
    const validation = validatePayload(body);
    if (!validation.ok) {
      return jsonResponse({ error: validation.error }, 400);
    }

    const insightsData = validation.data;

    // Upsert generation idempotently on (brand_id, week_start_date)
    const { data: generation, error: genError } = await supabase
      .from("brand_insights_generations")
      .upsert(
        {
          brand_id: insightsData.brand_id,
          country: insightsData.country ?? null,
          week_start_date: insightsData.week_start_date,
          generated_by: "brand-insights-mcp-v1",
          status: "processing",
        },
        { onConflict: "brand_id,week_start_date" },
      )
      .select()
      .single();

    if (genError) throw genError;
    const generationId: string = generation.id;

    // Clear previous child rows for idempotent reruns
    await Promise.all([
      supabase.from("brand_insights_trends").delete().eq("generation_id", generationId),
      supabase.from("brand_insights_events").delete().eq("generation_id", generationId),
      supabase.from("brand_insights_questions").delete().eq("generation_id", generationId),
    ]);

    async function processTrends(): Promise<EntityCounts> {
      const trends = insightsData.trends_and_events?.trends ?? [];
      const valid = trends.filter((t) => t?.title);
      const invalidCount = trends.length - valid.length;

      if (valid.length === 0) return { total: 0, failed: invalidCount };

      const texts = valid.map((t) =>
        [t.title, t.description, t.relevance_to_brand].filter(Boolean).join("\n")
      );
      const embeddings = await embedBatch(texts, openai);

      const rows = valid.map((t, i) => ({
        generation_id: generationId,
        brand_id: insightsData.brand_id,
        title: t.title,
        description: t.description ?? null,
        relevance_to_brand: t.relevance_to_brand ?? null,
        source: t.source ?? null,
        embedding: embeddings[i],
      }));

      const { error } = await supabase.from("brand_insights_trends").insert(rows);
      if (error) {
        console.error("Trend bulk insert failed:", error);
        return { total: 0, failed: valid.length + invalidCount };
      }
      return { total: valid.length, failed: invalidCount };
    }

    async function processEvents(): Promise<EntityCounts> {
      const events = insightsData.trends_and_events?.events ?? [];
      const valid = events.filter((e) => e?.title);
      const invalidCount = events.length - valid.length;

      if (valid.length === 0) return { total: 0, failed: invalidCount };

      const texts = valid.map((e) =>
        [e.title, e.description, e.opportunity].filter(Boolean).join("\n")
      );
      const embeddings = await embedBatch(texts, openai);

      const rows = valid.map((e, i) => ({
        generation_id: generationId,
        brand_id: insightsData.brand_id,
        title: e.title,
        event_date: e.date ?? null,
        description: e.description ?? null,
        opportunity: e.opportunity ?? null,
        embedding: embeddings[i],
      }));

      const { error } = await supabase.from("brand_insights_events").insert(rows);
      if (error) {
        console.error("Event bulk insert failed:", error);
        return { total: 0, failed: valid.length + invalidCount };
      }
      return { total: valid.length, failed: invalidCount };
    }

    async function processQuestions(): Promise<EntityCounts> {
      const nicheMap = insightsData.questions_by_niche ?? {};
      const allItems: { niche: string; q: QuestionData }[] = [];

      for (const niche of Object.keys(nicheMap)) {
        for (const q of nicheMap[niche]?.questions ?? []) {
          allItems.push({ niche, q });
        }
      }

      const valid = allItems.filter((item) => item.q?.question);
      const invalidCount = allItems.length - valid.length;

      if (valid.length === 0) return { total: 0, failed: invalidCount };

      const texts = valid.map(({ q }) =>
        [q.question, q.why_relevant].filter(Boolean).join("\n")
      );
      const embeddings = await embedBatch(texts, openai);

      const rows = valid.map(({ niche, q }, i) => ({
        generation_id: generationId,
        brand_id: insightsData.brand_id,
        niche,
        question_text: q.question,
        social_platform: q.social_platform ?? null,
        content_type_suggestion: q.content_type_suggestion ?? null,
        why_relevant: q.why_relevant ?? null,
        embedding: embeddings[i],
      }));

      const { error } = await supabase.from("brand_insights_questions").insert(rows);
      if (error) {
        console.error("Question bulk insert failed:", error);
        return { total: 0, failed: valid.length + invalidCount };
      }
      return { total: valid.length, failed: invalidCount };
    }

    const [trendResult, eventResult, questionResult] = await Promise.all([
      processTrends(),
      processEvents(),
      processQuestions(),
    ]);

    const totalTrends = trendResult.total;
    const totalEvents = eventResult.total;
    const totalQuestions = questionResult.total;
    const failedTrends = trendResult.failed;
    const failedEvents = eventResult.failed;
    const failedQuestions = questionResult.failed;

    const status = (failedTrends + failedEvents + failedQuestions) > 0 ? "completed_with_errors" : "completed";

    await supabase.from("brand_insights_generations").update({
      status,
      total_trends: totalTrends,
      total_events: totalEvents,
      total_questions: totalQuestions,
    }).eq("id", generationId);

    return jsonResponse({
      success: true,
      generation_id: generationId,
      status,
      stats: { trends: totalTrends, events: totalEvents, questions: totalQuestions },
      failed: { trends: failedTrends, events: failedEvents, questions: failedQuestions },
    });
  } catch (error: unknown) {
    console.error("Error processing brand insights context:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
