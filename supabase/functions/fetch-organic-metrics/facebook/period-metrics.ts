
import { formatDate } from "../date-utils.ts";

// Helper function to calculate percentage change
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

// Fetch and process metrics for a given period
export async function fetchPeriodMetrics(pageId: string, accessToken: string, dateParams: { since: string, until: string }) {
  const metricsUrl = new URL(`https://graph.facebook.com/v22.0/${pageId}/insights`);
  metricsUrl.searchParams.append('metric', 'page_fan_adds,page_fan_removes,page_impressions_unique,page_impressions');
  metricsUrl.searchParams.append('period', 'day');
  metricsUrl.searchParams.append('since', dateParams.since);
  metricsUrl.searchParams.append('until', dateParams.until);
  metricsUrl.searchParams.append('access_token', accessToken);

  // Posts URL setup for engagement metrics
  const postsUrl = new URL(`https://graph.facebook.com/v22.0/${pageId}/feed`);
  const effectiveSinceDate = new Date(dateParams.since);
  const requestedSinceDate = new Date(dateParams.since);
  const untilDate = new Date(dateParams.until);
  const minFetchDays = 30;
    
  // Calculate 30 days before the until date
  const minSinceDate = new Date(untilDate);
  minSinceDate.setDate(untilDate.getDate() - minFetchDays);
    
  // Use the earlier of our requested since date or the minimum fetch date
  const effectiveSince = requestedSinceDate < minSinceDate ? requestedSinceDate : minSinceDate;
  const effectiveSinceStr = formatDate(effectiveSince);
  
  postsUrl.searchParams.append('fields', 'id,created_time,likes.summary(true)');
  postsUrl.searchParams.append('since', effectiveSinceStr);
  postsUrl.searchParams.append('until', dateParams.until);
  postsUrl.searchParams.append('limit', '100');
  postsUrl.searchParams.append('access_token', accessToken);

  console.log(`Fetching Facebook metrics for period: ${dateParams.since} to ${dateParams.until}`);

  const [metricsResponse, postsResponse] = await Promise.all([
    fetch(metricsUrl.toString()),
    fetch(postsUrl.toString())
  ]);

  if (!metricsResponse.ok) {
    throw new Error(`Facebook metrics API error: ${await metricsResponse.text()}`);
  }

  const metricsData = await metricsResponse.json();
  let netLikes = 0;
  let reach = 0;
  let impressions = 0;
  let engagement = 0;

  // Process standard metrics
  if (metricsData.data) {
    // Calculate net likes
    const fanAdds = metricsData.data.find((item: any) => item.name === 'page_fan_adds');
    const fanRemoves = metricsData.data.find((item: any) => item.name === 'page_fan_removes');
    
    if (fanAdds && fanRemoves && fanAdds.values && fanRemoves.values) {
      const totalAdds = fanAdds.values.reduce((sum: number, val: any) => sum + (val.value || 0), 0);
      const totalRemoves = fanRemoves.values.reduce((sum: number, val: any) => sum + (val.value || 0), 0);
      netLikes = totalAdds - totalRemoves;
    }
    
    // Get reach and impressions
    const reachData = metricsData.data.find((item: any) => item.name === 'page_impressions_unique');
    const impressionsData = metricsData.data.find((item: any) => item.name === 'page_impressions');
    
    if (reachData?.values) {
      reach = reachData.values.reduce((sum: number, val: any) => sum + (val.value || 0), 0);
    }
    
    if (impressionsData?.values) {
      impressions = impressionsData.values.reduce((sum: number, val: any) => sum + (val.value || 0), 0);
    }
  }

  // Process posts data for engagement
  if (postsResponse.ok) {
    const postsData = await postsResponse.json();
    
    // Function to check if a post is within our requested date range
    const isPostInRequestedRange = (postCreatedTime: string): boolean => {
      const postDate = new Date(postCreatedTime);
      const sinceDate = new Date(dateParams.since);
      const untilDate = new Date(dateParams.until);
      
      // Set times to beginning/end of day for accurate comparison
      sinceDate.setHours(0, 0, 0, 0);
      untilDate.setHours(23, 59, 59, 999);
      
      return postDate >= sinceDate && postDate <= untilDate;
    };
    
    if (postsData?.data) {
      let totalLikes = 0;
      
      for (const post of postsData.data) {
        if (post.created_time && isPostInRequestedRange(post.created_time)) {
          if (post.likes?.summary?.total_count) {
            totalLikes += post.likes.summary.total_count;
          }
        }
      }
      
      engagement = totalLikes;
    }
  }

  return { netLikes, reach, impressions, engagement };
}
