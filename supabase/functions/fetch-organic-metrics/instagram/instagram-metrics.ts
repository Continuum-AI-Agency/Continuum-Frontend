
import { corsHeaders } from "../cors.ts";
import { DateParams } from "../types.ts";
import { getInstagramDateParams, getInstagramPreviousPeriodDateParams } from "../date-utils.ts";
import { 
  fetchMetricsForPeriod,
  fetchViewsBreakdown,
  fetchReachBreakdown,
  fetchProfileVisits,
  fetchFollowerGrowth
} from "./metrics-fetcher.ts";
import {
  calculatePercentageChange,
  processBaseMetrics,
  processViewsBreakdown,
  processReachBreakdown,
  processProfileVisits,
  processFollowerGrowth
} from "./metrics-processor.ts";

// Main function to fetch Instagram metrics
export async function fetchInstagramMetrics(instagramId: string, accessToken: string, dateParams: DateParams) {
  try {
    // Use Instagram-specific date params to ensure we don't exceed 30 days
    // Pass custom date range if we're using a custom date preset
    const customDateRange = dateParams.date_preset === 'custom' 
      ? { from: dateParams.since, to: dateParams.until }
      : undefined;
    
    const instagramDateParams = getInstagramDateParams(dateParams.date_preset, customDateRange);
    
    // Fetch current period metrics
    console.log(`Fetching current period Instagram metrics for ${dateParams.date_preset}`);
    
    // Fetch all metrics in parallel
    const [
      metricsData,
      viewsBreakdownData,
      reachBreakdownData,
      profileVisitsData,
      followerData
    ] = await Promise.all([
      fetchMetricsForPeriod(instagramId, accessToken, instagramDateParams),
      fetchViewsBreakdown(instagramId, accessToken, instagramDateParams),
      fetchReachBreakdown(instagramId, accessToken, instagramDateParams),
      fetchProfileVisits(instagramId, accessToken),
      fetchFollowerGrowth(instagramId, accessToken, instagramDateParams)
    ]);
    
    // Process current period metrics
    const baseMetrics = processBaseMetrics(metricsData);
    const { reelsViews, postViews, storiesViews } = processViewsBreakdown(viewsBreakdownData);
    const { nonFollowerReach, followerReach } = processReachBreakdown(reachBreakdownData);
    const profileVisitsYesterday = processProfileVisits(profileVisitsData);
    const newFollowers = processFollowerGrowth(followerData);
    
    // Log reach breakdown for debugging
    console.log("Instagram reach breakdown processed results:");
    console.log("- nonFollowerReach:", nonFollowerReach);
    console.log("- followerReach:", followerReach);
    
    // Initialize comparison data
    let comparison = null;
    
    // Allow comparison for 'yesterday', 'last_7d', and 'last_14d'
    if (['yesterday', 'last_7d', 'last_14d', 'custom'].includes(dateParams.date_preset)) {
      // Get previous period date parameters, passing custom date range if needed
      const previousPeriodParams = getInstagramPreviousPeriodDateParams(
        dateParams.date_preset, 
        customDateRange
      );
      
      if (previousPeriodParams) {
        try {
          console.log(`Fetching previous period Instagram metrics for ${dateParams.date_preset}`);
          
          // Fetch previous period metrics in parallel
          const [
            previousMetricsData,
            previousViewsBreakdownData,
            previousReachBreakdownData,
            previousFollowerData
          ] = await Promise.all([
            fetchMetricsForPeriod(instagramId, accessToken, previousPeriodParams),
            fetchViewsBreakdown(instagramId, accessToken, previousPeriodParams),
            fetchReachBreakdown(instagramId, accessToken, previousPeriodParams),
            fetchFollowerGrowth(instagramId, accessToken, previousPeriodParams)
          ]);
          
          // Process previous period metrics
          const previousBaseMetrics = processBaseMetrics(previousMetricsData);
          const previousViewsMetrics = processViewsBreakdown(previousViewsBreakdownData);
          const { nonFollowerReach: prevNonFollowerReach, followerReach: prevFollowerReach } = processReachBreakdown(previousReachBreakdownData);
          const previousNewFollowers = processFollowerGrowth(previousFollowerData);
          
          // Calculate comparison metrics
          comparison = {
            new_followers: {
              current: newFollowers,
              previous: previousNewFollowers,
              percentage_change: calculatePercentageChange(newFollowers, previousNewFollowers)
            },
            reach: {
              current: baseMetrics.reach,
              previous: previousBaseMetrics.reach,
              percentage_change: calculatePercentageChange(baseMetrics.reach, previousBaseMetrics.reach)
            },
            views: {
              current: baseMetrics.views,
              previous: previousBaseMetrics.views,
              percentage_change: calculatePercentageChange(baseMetrics.views, previousBaseMetrics.views)
            },
            accounts_engaged: {
              current: baseMetrics.engagedAccounts,
              previous: previousBaseMetrics.engagedAccounts,
              percentage_change: calculatePercentageChange(baseMetrics.engagedAccounts, previousBaseMetrics.engagedAccounts)
            },
            reels_views: {
              current: reelsViews,
              previous: previousViewsMetrics.reelsViews,
              percentage_change: calculatePercentageChange(reelsViews, previousViewsMetrics.reelsViews)
            },
            post_views: {
              current: postViews,
              previous: previousViewsMetrics.postViews,
              percentage_change: calculatePercentageChange(postViews, previousViewsMetrics.postViews)
            },
            non_follower_reach: {
              current: nonFollowerReach,
              previous: prevNonFollowerReach,
              percentage_change: calculatePercentageChange(nonFollowerReach, prevNonFollowerReach)
            },
            follower_reach: {
              current: followerReach,
              previous: prevFollowerReach,
              percentage_change: calculatePercentageChange(followerReach, prevFollowerReach)
            }
          };
          
          console.log('Comparison metrics calculated:', JSON.stringify(comparison));
        } catch (error) {
          console.error("Error fetching previous period metrics:", error);
        }
      }
    } else {
      console.log(`Skipping comparison for ${dateParams.date_preset}`);
    }
    
    const result = {
      platform: 'instagram',
      account_id: instagramId,
      range: dateParams.date_preset,
      metrics: {
        new_followers: newFollowers,
        reach: baseMetrics.reach,
        views: baseMetrics.views,
        accounts_engaged: baseMetrics.engagedAccounts,
        reels_views: reelsViews,
        post_views: postViews,
        profile_visits_yesterday: profileVisitsYesterday,
        non_follower_reach: nonFollowerReach,
        follower_reach: followerReach,
        stories_views: storiesViews
      },
      comparison
    };
    
    console.log(`Returning Instagram metrics with comparison:`, JSON.stringify(result));
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Error fetching Instagram metrics:", error);
    throw error;
  }
}
