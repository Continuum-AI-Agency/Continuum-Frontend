/// <reference types="https://deno.land/x/deno/cli/types/v8.d.ts" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4.29.2'

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
  questions: QuestionData[];
  [key: string]: any;
}

interface InsightsData {
  brand_id: string;
  platform_account_id?: string;
  country?: string;
  week_start_date: string;
  trends_and_events: {
    trends?: TrendData[];
    events?: EventData[];
  };
  questions_by_niche: {
    [niche: string]: NicheQuestions;
  };
  selected_social_platforms?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '', 
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { brand_id, platform_account_id, generation_data } = await req.json();

    if (!generation_data || (!brand_id && !generation_data?.brand_id)) {
      return new Response(
        JSON.stringify({ error: 'brand_id and generation_data are required.' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resolvedBrandId: string = brand_id ?? generation_data.brand_id;
    const resolvedPlatformAccountId: string | undefined =
      platform_account_id ?? generation_data.platform_account_id;

    console.log(
      `Processing brand insights for brand: ${resolvedBrandId}${
        resolvedPlatformAccountId ? ` (platform_account_id: ${resolvedPlatformAccountId})` : ''
      }`
    );

    const insightsData: InsightsData = {
      ...generation_data,
      brand_id: resolvedBrandId,
      platform_account_id: resolvedPlatformAccountId,
    };

    // STEP 1: Create generation record
    const { data: generation, error: genError } = await supabase
      .from('brand_insights_generations')
      .insert({
        brand_id: resolvedBrandId,
        platform_account_id: resolvedPlatformAccountId ?? null,
        country: insightsData.country || null,
        week_start_date: insightsData.week_start_date,
        generated_by: 'brand-insights-mcp-v1',
        status: 'processing',
      })
      .select()
      .single();

    if (genError) {
      console.error('Error creating generation:', genError);
      throw genError;
    }

    console.log(`Created generation: ${generation.id}`);

    let totalTrends = 0;
    let totalEvents = 0;
    let totalQuestions = 0;

    // STEP 2: Process trends individually
    const trends = insightsData.trends_and_events?.trends || [];
    if (trends.length > 0) {
      console.log(`Processing ${trends.length} trends...`);
      
      const trendsToInsert = [];
      
      for (const trend of trends) {
        try {
          const trendText = [
            trend.title,
            trend.description || '',
            trend.relevance_to_brand || ''
          ].filter(Boolean).join('\n');

          let embedding = null;
          if (trendText.trim()) {
            const embeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: trendText
            });
            embedding = embeddingResponse.data[0].embedding;
          }

          trendsToInsert.push({
            generation_id: generation.id,
            brand_id: resolvedBrandId,
            platform_account_id: resolvedPlatformAccountId ?? null,
            title: trend.title,
            description: trend.description || null,
            relevance_to_brand: trend.relevance_to_brand || null,
            source: trend.source || null,
            embedding,
          });
        } catch (error) {
          console.error(`Error processing trend "${trend.title}":`, error);
        }
      }

      if (trendsToInsert.length > 0) {
        const { error: trendsError } = await supabase
          .from('brand_insights_trends')
          .insert(trendsToInsert);

        if (trendsError) {
          console.error('Error inserting trends:', trendsError);
        } else {
          totalTrends = trendsToInsert.length;
          console.log(`Successfully inserted ${totalTrends} trends`);
        }
      }
    }

    // STEP 3: Process events individually
    const events = insightsData.trends_and_events?.events || [];
    if (events.length > 0) {
      console.log(`Processing ${events.length} events...`);
      
      const eventsToInsert = [];
      
      for (const event of events) {
        try {
          const eventText = [
            event.title,
            event.description || '',
            event.opportunity || ''
          ].filter(Boolean).join('\n');

          let embedding = null;
          if (eventText.trim()) {
            const embeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: eventText
            });
            embedding = embeddingResponse.data[0].embedding;
          }

          eventsToInsert.push({
            generation_id: generation.id,
            brand_id: resolvedBrandId,
            platform_account_id: resolvedPlatformAccountId ?? null,
            title: event.title,
            event_date: event.date || null,
            description: event.description || null,
            opportunity: event.opportunity || null,
            embedding,
          });
        } catch (error) {
          console.error(`Error processing event "${event.title}":`, error);
        }
      }

      if (eventsToInsert.length > 0) {
        const { error: eventsError } = await supabase
          .from('brand_insights_events')
          .insert(eventsToInsert);

        if (eventsError) {
          console.error('Error inserting events:', eventsError);
        } else {
          totalEvents = eventsToInsert.length;
          console.log(`Successfully inserted ${totalEvents} events`);
        }
      }
    }

    // STEP 4: Process questions by niche
    const questionsByNiche = insightsData.questions_by_niche || {};
    const niches = Object.keys(questionsByNiche);
    
    if (niches.length > 0) {
      console.log(`Processing questions for ${niches.length} niches...`);
      
      const questionsToInsert = [];
      
      for (const niche of niches) {
        const nicheData = questionsByNiche[niche];
        const questions = nicheData.questions || [];
        
        for (const question of questions) {
          try {
            const questionText = [
              question.question,
              question.why_relevant || ''
            ].filter(Boolean).join('\n');

            let embedding = null;
            if (questionText.trim()) {
              const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: questionText
              });
              embedding = embeddingResponse.data[0].embedding;
            }

            questionsToInsert.push({
              generation_id: generation.id,
              brand_id: resolvedBrandId,
              platform_account_id: resolvedPlatformAccountId ?? null,
              niche,
              question_text: question.question,
              social_platform: question.social_platform || null,
              content_type_suggestion: question.content_type_suggestion || null,
              why_relevant: question.why_relevant || null,
              embedding,
            });
          } catch (error) {
            console.error(`Error processing question for niche "${niche}":`, error);
          }
        }
      }

      if (questionsToInsert.length > 0) {
        const { error: questionsError } = await supabase
          .from('brand_insights_questions')
          .insert(questionsToInsert);

        if (questionsError) {
          console.error('Error inserting questions:', questionsError);
        } else {
          totalQuestions = questionsToInsert.length;
          console.log(`Successfully inserted ${totalQuestions} questions`);
        }
      }
    }

    // STEP 5: Update generation with totals and mark as completed
    const { error: updateError } = await supabase
      .from('brand_insights_generations')
      .update({
        status: 'completed',
        total_trends: totalTrends,
        total_events: totalEvents,
        total_questions: totalQuestions,
      })
      .eq('id', generation.id);

    if (updateError) {
      console.error('Error updating generation status:', updateError);
    }

    console.log(
      `Successfully processed brand insights for brand: ${resolvedBrandId}${
        resolvedPlatformAccountId ? ` (platform_account_id: ${resolvedPlatformAccountId})` : ''
      }`
    );
    console.log(`Stats: ${totalTrends} trends, ${totalEvents} events, ${totalQuestions} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        generation_id: generation.id,
        stats: {
          trends: totalTrends,
          events: totalEvents,
          questions: totalQuestions,
        },
        message: `Successfully processed brand insights with ${totalTrends + totalEvents + totalQuestions} items.`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error processing brand insights context:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString()
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})
