
import { corsHeaders } from "../cors.ts";
import { DateParams } from "../types.ts";
import { getPreviousPeriodDateParams } from "../date-utils.ts";
import { calculatePercentageChange, fetchPeriodMetrics } from "./period-metrics.ts";

export async function fetchFacebookMetrics(pageId: string, accessToken: string, dateParams: DateParams) {
  try {
    console.log('Starting Facebook metrics fetch with comparison data');
    
    // Fetch current period metrics
    const currentMetrics = await fetchPeriodMetrics(pageId, accessToken, dateParams);
    
    // Initialize comparison data
    let comparison = null;
    
    // Allow comparison for 'yesterday', 'last_7d', and 'last_14d'
    if (['yesterday', 'last_7d', 'last_14d'].includes(dateParams.date_preset)) {
      const previousPeriodParams = getPreviousPeriodDateParams(dateParams.date_preset);
      
      if (previousPeriodParams) {
        console.log('Fetching previous period metrics for comparison');
        const previousMetrics = await fetchPeriodMetrics(pageId, accessToken, previousPeriodParams);
        
        comparison = {
          net_likes: {
            current: currentMetrics.netLikes,
            previous: previousMetrics.netLikes,
            percentage_change: calculatePercentageChange(currentMetrics.netLikes, previousMetrics.netLikes)
          },
          reach: {
            current: currentMetrics.reach,
            previous: previousMetrics.reach,
            percentage_change: calculatePercentageChange(currentMetrics.reach, previousMetrics.reach)
          },
          impressions: {
            current: currentMetrics.impressions,
            previous: previousMetrics.impressions,
            percentage_change: calculatePercentageChange(currentMetrics.impressions, previousMetrics.impressions)
          },
          engagement: {
            current: currentMetrics.engagement,
            previous: previousMetrics.engagement,
            percentage_change: calculatePercentageChange(currentMetrics.engagement, previousMetrics.engagement)
          }
        };
      }
    }

    const result = {
      platform: 'facebook',
      account_id: pageId,
      range: dateParams.date_preset,
      metrics: {
        net_likes: currentMetrics.netLikes,
        reach: currentMetrics.reach,
        impressions: currentMetrics.impressions,
        engagement: currentMetrics.engagement,
      },
      comparison
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Error fetching Facebook metrics:", error);
    throw error;
  }
}
