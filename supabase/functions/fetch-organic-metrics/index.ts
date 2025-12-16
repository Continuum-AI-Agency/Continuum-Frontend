
// Main entry point for the edge function
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "./cors.ts";
import { getDateParams } from "./date-utils.ts";
import { fetchFacebookMetrics } from "./facebook-metrics.ts";
import { fetchInstagramMetrics } from "./instagram-metrics.ts";
import { PlatformType, RequestParams } from "./types.ts";

// Main handler function for the edge function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      platform, 
      accountId, 
      dateRange, 
      userToken, 
      pageId, 
      instagramId,
      customDateRange 
    } = await req.json() as RequestParams;

    console.log(`Fetching ${platform} metrics for account ${accountId} with range ${dateRange}`);
    if (customDateRange) {
      console.log(`Using custom date range: from ${customDateRange.from} to ${customDateRange.to}`);
    }

    // Generate date params based on dateRange and customDateRange (if provided)
    const dateParams = getDateParams(dateRange, customDateRange);
    
    if (platform === 'facebook') {
      return await fetchFacebookMetrics(pageId, userToken, dateParams);
    } else if (platform === 'instagram') {
      return await fetchInstagramMetrics(instagramId, userToken, dateParams);
    }

    return new Response(
      JSON.stringify({ error: 'Invalid platform specified' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching organic metrics:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
