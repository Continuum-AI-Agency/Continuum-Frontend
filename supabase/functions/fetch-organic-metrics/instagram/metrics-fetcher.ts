
import { DateParams } from "../types.ts";
import { formatDate } from "../date-utils.ts";

// Helper function to fetch metrics for a specific period
export async function fetchMetricsForPeriod(instagramId: string, accessToken: string, dateParams: DateParams) {
  try {
    // Fetch Instagram metrics (reach + views + engagement)
    const metricsUrl = new URL(`https://graph.facebook.com/v22.0/${instagramId}/insights`);
    metricsUrl.searchParams.append('metric', 'reach,views,accounts_engaged');
    metricsUrl.searchParams.append('metric_type', 'total_value');
    metricsUrl.searchParams.append('period', 'day');
    metricsUrl.searchParams.append('since', dateParams.since);
    metricsUrl.searchParams.append('until', dateParams.until);
    metricsUrl.searchParams.append('access_token', accessToken);

    console.log(`Instagram insights request with metrics: reach,views,accounts_engaged`);
    console.log(`Instagram insights URL params: since=${dateParams.since}, until=${dateParams.until}, period=day`);
    console.log(`Meta API will return metrics FROM ${dateParams.since} (inclusive) UP TO BUT NOT INCLUDING ${dateParams.until}`);
    console.log('Full metrics URL:', metricsUrl.toString().replace(accessToken, '[REDACTED]'));
    
    const metricsResponse = await fetch(metricsUrl.toString());
    
    if (!metricsResponse.ok) {
      throw new Error(`Instagram API error: ${await metricsResponse.text()}`);
    }
    
    const metricsData = await metricsResponse.json();
    console.log('Instagram metrics response:', JSON.stringify(metricsData));

    return metricsData;
  } catch (error) {
    console.error("Error fetching metrics:", error);
    throw error;
  }
}

// Fetch views breakdown by media type
export async function fetchViewsBreakdown(instagramId: string, accessToken: string, dateParams: DateParams) {
  const viewsBreakdownUrl = new URL(`https://graph.facebook.com/v22.0/${instagramId}/insights`);
  viewsBreakdownUrl.searchParams.append('metric', 'views');
  viewsBreakdownUrl.searchParams.append('metric_type', 'total_value');
  viewsBreakdownUrl.searchParams.append('breakdown', 'media_product_type');
  viewsBreakdownUrl.searchParams.append('period', 'day');
  viewsBreakdownUrl.searchParams.append('since', dateParams.since);
  viewsBreakdownUrl.searchParams.append('until', dateParams.until);
  viewsBreakdownUrl.searchParams.append('access_token', accessToken);
  
  console.log(`Instagram views breakdown URL params: since=${dateParams.since}, until=${dateParams.until}, period=day`);
  console.log('Full views breakdown URL:', viewsBreakdownUrl.toString().replace(accessToken, '[REDACTED]'));
  
  const response = await fetch(viewsBreakdownUrl.toString());
  return response.ok ? await response.json() : null;
}

// Fetch reach breakdown by follower type
export async function fetchReachBreakdown(instagramId: string, accessToken: string, dateParams: DateParams) {
  const reachBreakdownUrl = new URL(`https://graph.facebook.com/v22.0/${instagramId}/insights`);
  reachBreakdownUrl.searchParams.append('metric', 'reach');
  reachBreakdownUrl.searchParams.append('metric_type', 'total_value');
  reachBreakdownUrl.searchParams.append('breakdown', 'follow_type');
  reachBreakdownUrl.searchParams.append('period', 'day');
  reachBreakdownUrl.searchParams.append('since', dateParams.since);
  reachBreakdownUrl.searchParams.append('until', dateParams.until);
  reachBreakdownUrl.searchParams.append('access_token', accessToken);
  
  console.log(`Instagram reach breakdown URL params: since=${dateParams.since}, until=${dateParams.until}, period=day`);
  console.log('Full reach breakdown URL:', reachBreakdownUrl.toString().replace(accessToken, '[REDACTED]'));
  
  const response = await fetch(reachBreakdownUrl.toString());
  return response.ok ? await response.json() : null;
}

// Fetch profile visits (yesterday only)
export async function fetchProfileVisits(instagramId: string, accessToken: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const dayBeforeYesterday = new Date(yesterday);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1);
  const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
  
  const profileVisitsUrl = new URL(`https://graph.facebook.com/v22.0/${instagramId}/insights`);
  profileVisitsUrl.searchParams.append('metric', 'profile_views');
  profileVisitsUrl.searchParams.append('metric_type', 'total_value');
  profileVisitsUrl.searchParams.append('period', 'day');
  profileVisitsUrl.searchParams.append('since', dayBeforeYesterdayStr);
  profileVisitsUrl.searchParams.append('until', yesterdayStr);
  profileVisitsUrl.searchParams.append('access_token', accessToken);
  
  console.log(`Instagram profile visits URL params: since=${dayBeforeYesterdayStr}, until=${yesterdayStr}, period=day`);
  console.log('Full profile visits URL:', profileVisitsUrl.toString().replace(accessToken, '[REDACTED]'));
  
  const response = await fetch(profileVisitsUrl.toString());
  return response.ok ? await response.json() : null;
}

// Fetch follower growth
export async function fetchFollowerGrowth(instagramId: string, accessToken: string, dateParams: DateParams) {
  const followerUrl = new URL(`https://graph.facebook.com/v22.0/${instagramId}/insights`);
  followerUrl.searchParams.append('metric', 'follower_count');
  followerUrl.searchParams.append('period', 'day');
  followerUrl.searchParams.append('since', dateParams.since);
  followerUrl.searchParams.append('until', dateParams.until);
  followerUrl.searchParams.append('access_token', accessToken);

  console.log(`Instagram follower URL params: since=${dateParams.since}, until=${dateParams.until}, period=day`);
  console.log(`Meta API will return follower metrics FROM ${dateParams.since} (inclusive) UP TO BUT NOT INCLUDING ${dateParams.until}`);
  console.log('Full follower URL:', followerUrl.toString().replace(accessToken, '[REDACTED]'));
  
  const response = await fetch(followerUrl.toString());
  return response.ok ? await response.json() : null;
}
