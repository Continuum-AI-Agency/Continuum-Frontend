// Helper function to calculate percentage change between current and previous values
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0; // If previous was 0, any positive value is 100% increase
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function processBaseMetrics(metricsData: any) {
  let reach = 0;
  let views = 0;
  let engagedAccounts = 0;
  
  if (metricsData.data && Array.isArray(metricsData.data)) {
    for (const metric of metricsData.data) {
      if (!metric || !metric.name) {
        console.warn('Invalid metric data:', metric);
        continue;
      }
      
      switch (metric.name) {
        case 'reach':
          if (metric.total_value && typeof metric.total_value.value === 'number') {
            reach = metric.total_value.value;
            console.log(`Processed reach metric: ${reach}`);
          } else {
            console.warn('Invalid reach metric structure:', metric);
          }
          break;
        case 'views':
          if (metric.total_value && typeof metric.total_value.value === 'number') {
            views = metric.total_value.value;
            console.log(`Processed views metric: ${views}`);
          } else {
            console.warn('Invalid views metric structure:', metric);
          }
          break;
        case 'accounts_engaged':
          if (metric.total_value && typeof metric.total_value.value === 'number') {
            engagedAccounts = metric.total_value.value;
            console.log(`Processed accounts_engaged metric: ${engagedAccounts}`);
          } else {
            console.warn('Invalid accounts_engaged metric structure:', metric);
          }
          break;
      }
    }
  }

  return { reach, views, engagedAccounts };
}

export function processViewsBreakdown(viewsBreakdownData: any) {
  let reelsViews = 0;
  let postViews = 0;
  let storiesViews = 0; // Added stories views

  if (viewsBreakdownData?.data?.[0]?.total_value?.breakdowns?.[0]?.results) {
    const results = viewsBreakdownData.data[0].total_value.breakdowns[0].results;
    for (const result of results) {
      if (result.dimension_values && result.dimension_values[0] === 'REEL') {
        reelsViews = result.value || 0;
        console.log(`Processed reels_views metric: ${reelsViews}`);
      } else if (result.dimension_values && result.dimension_values[0] === 'STORY') {
        // Extract story views specifically
        storiesViews = result.value || 0;
        console.log(`Processed stories_views metric: ${storiesViews}`);
      } else if (result.dimension_values && 
                ['POST', 'CAROUSEL_CONTAINER'].includes(result.dimension_values[0])) {
        postViews += (result.value || 0);
        console.log(`Added to post_views: ${result.value || 0} from ${result.dimension_values[0]}`);
      }
    }
  }

  console.log(`Final post_views metric: ${postViews}`);
  console.log(`Final stories_views metric: ${storiesViews}`);
  return { reelsViews, postViews, storiesViews };
}

export function processReachBreakdown(reachBreakdownData: any) {
  let nonFollowerReach = 0;
  let followerReach = 0;
  let totalReach = 0;

  console.log("Processing reach breakdown data:", JSON.stringify(reachBreakdownData));
  
  if (reachBreakdownData?.data?.[0]?.total_value?.breakdowns?.[0]?.results) {
    const results = reachBreakdownData.data[0].total_value.breakdowns[0].results;
    console.log("Reach breakdown results:", JSON.stringify(results));
    
    for (const result of results) {
      if (result.dimension_values && result.dimension_values[0] === 'NON_FOLLOWER') {
        nonFollowerReach = result.value || 0;
        console.log(`Processed non_follower_reach metric: ${nonFollowerReach}`);
      } else if (result.dimension_values && result.dimension_values[0] === 'FOLLOWER') {
        followerReach = result.value || 0;
        console.log(`Processed follower_reach metric: ${followerReach}`);
      }
    }
    totalReach = nonFollowerReach + followerReach;
    console.log(`Total reach from breakdown: ${totalReach}`);
  } else {
    console.warn("Missing or invalid reach breakdown structure:", reachBreakdownData);
  }

  return { nonFollowerReach, followerReach, totalReach };
}

export function processProfileVisits(profileVisitsData: any) {
  let profileVisitsYesterday = 0;

  if (profileVisitsData?.data?.[0]?.total_value?.value) {
    profileVisitsYesterday = profileVisitsData.data[0].total_value.value;
    console.log(`Processed profile_visits_yesterday metric: ${profileVisitsYesterday}`);
  }

  return profileVisitsYesterday;
}

export function processFollowerGrowth(followerData: any) {
  let newFollowers = 0;

  if (followerData?.data) {
    const followerCountData = followerData.data.find((item: any) => item.name === 'follower_count');
    if (followerCountData?.values && followerCountData.values.length >= 1) {
      console.log('Processing follower count data:', JSON.stringify(followerCountData.values));
      
      newFollowers = followerCountData.values.reduce((sum: number, val: any) => {
        return sum + (val.value || 0);
      }, 0);
      
      console.log(`Total sum of new followers across period: ${newFollowers}`);
    }
  }

  return newFollowers;
}
