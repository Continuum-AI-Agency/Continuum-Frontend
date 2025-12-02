/// <reference types="https://deno.land/x/deno/cli/types/v8.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.29.2";

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

function validatePayload(body: any): { ok: true; data: InsightsData } | { ok: false; error: string } {
  const { brand_id, generation_data } = body ?? {};
  if (!generation_data || !brand_id) {
    return { ok: false, error: "brand_id and generation_data are required." };
  }
  if (typeof generation_data.week_start_date !== "string") {
    return { ok: false, error: "week_start_date is required." };
  }
  if (generation_data.trends_and_events && typeof generation_data.trends_and_events !== "object") {
    return { ok: false, error: "trends_and_events must be an object." };
  }
  if (generation_data.questions_by_niche && typeof generation_data.questions_by_niche !== "object") {
    return { ok: false, error: "questions_by_niche must be an object." };
  }

  const data: InsightsData = {
    ...generation_data,
    brand_id,
  };
  return { ok: true, data };
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
    await supabase.from("brand_insights_trends").delete().eq("generation_id", generationId);
    await supabase.from("brand_insights_events").delete().eq("generation_id", generationId);
    await supabase.from("brand_insights_questions").delete().eq("generation_id", generationId);

    let totalTrends = 0;
    let totalEvents = 0;
    let totalQuestions = 0;
    let failedTrends = 0;
    let failedEvents = 0;
    let failedQuestions = 0;

    const embedOrNull = async (text: string): Promise<number[] | null> => {
      const cleaned = (text || "").trim();
      if (!cleaned) return null;
      try {
        const resp = await openai.embeddings.create({ model: "text-embedding-3-small", input: cleaned });
        return resp.data[0]?.embedding ?? null;
      } catch (error) {
        console.error("Embedding failed", error);
        return null;
      }
    };

    // Trends
    for (const trend of insightsData.trends_and_events?.trends ?? []) {
      if (!trend?.title) { failedTrends++; continue; }
      const text = [trend.title, trend.description ?? "", trend.relevance_to_brand ?? ""].filter(Boolean).join("\n");
      const embedding = await embedOrNull(text);
        const { error } = await supabase.from("brand_insights_trends").insert({
          generation_id: generationId,
          brand_id: insightsData.brand_id,
          title: trend.title,
          description: trend.description ?? null,
          relevance_to_brand: trend.relevance_to_brand ?? null,
          source: trend.source ?? null,
          embedding,
        });
      if (error) failedTrends++; else totalTrends++;
    }

    // Events
    for (const event of insightsData.trends_and_events?.events ?? []) {
      if (!event?.title) { failedEvents++; continue; }
      const text = [event.title, event.description ?? "", event.opportunity ?? ""].filter(Boolean).join("\n");
      const embedding = await embedOrNull(text);
        const { error } = await supabase.from("brand_insights_events").insert({
          generation_id: generationId,
          brand_id: insightsData.brand_id,
          title: event.title,
          event_date: event.date ?? null,
          description: event.description ?? null,
          opportunity: event.opportunity ?? null,
          embedding,
        });
      if (error) failedEvents++; else totalEvents++;
    }

    // Questions
    for (const niche of Object.keys(insightsData.questions_by_niche ?? {})) {
      const qs = insightsData.questions_by_niche?.[niche]?.questions ?? [];
      for (const q of qs) {
        if (!q?.question) { failedQuestions++; continue; }
        const text = [q.question, q.why_relevant ?? ""].filter(Boolean).join("\n");
        const embedding = await embedOrNull(text);
        const { error } = await supabase.from("brand_insights_questions").insert({
          generation_id: generationId,
          brand_id: insightsData.brand_id,
          niche,
          question_text: q.question,
          social_platform: q.social_platform ?? null,
          content_type_suggestion: q.content_type_suggestion ?? null,
          why_relevant: q.why_relevant ?? null,
          embedding,
        });
        if (error) failedQuestions++; else totalQuestions++;
      }
    }

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
  } catch (error: any) {
    console.error("Error processing brand insights context:", error);
    return jsonResponse({ error: error?.message ?? "Unexpected error" }, 500);
  }
});
