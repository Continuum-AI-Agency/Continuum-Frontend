
// Utilities for date calculations

import { DateParams } from "./types.ts";

// Format a Date object to YYYY-MM-DD string
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

// Generate date parameters based on the requested date range
export function getDateParams(
  dateRange: string, 
  customDateRange?: { from: string; to: string }
): DateParams {
  // Handle custom date range if provided
  if (dateRange === 'custom' && customDateRange) {
    console.log(`Processing custom date range: ${customDateRange.from} to ${customDateRange.to}`);
    
    // Parse the dates from strings to Date objects
    const fromDate = new Date(customDateRange.from);
    const toDate = new Date(customDateRange.to);
    
    console.log(`Custom date range parsed as: ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    
    // For Meta API, the "until" parameter is exclusive, so we need to add 1 day to include the end date
    // But since we already have the end of day in the UI selection, we don't need to add a day
    return {
      since: formatDate(fromDate),
      until: formatDate(toDate),
      date_preset: 'custom'
    };
  }
  
  // Get current date and time in UTC
  const nowUTC = new Date();
  console.log(`Current UTC time: ${nowUTC.toISOString()}`);
  
  // Force the date to be at midnight UTC for consistent comparisons
  const todayUTC = new Date(nowUTC.getFullYear(), nowUTC.getMonth(), nowUTC.getDate());
  console.log(`Today at midnight UTC: ${todayUTC.toISOString()}`);
  
  let sinceDate: Date;
  let untilDate: Date;
  
  console.log(`Calculating date range for ${dateRange} based on today: ${todayUTC.toISOString()}`);

  // IMPORTANT: Meta API treats the "until" parameter as exclusive (up to but not including this date)
  // This means we need to use untilDate + 1 day when forming the API request

  switch (dateRange) {
    case 'yesterday':
      // Yesterday is 1 day before today
      sinceDate = new Date(todayUTC);
      sinceDate.setDate(todayUTC.getDate() - 1);
      
      // For Meta API, untilDate needs to be the day AFTER sinceDate (exclusive bound)
      // So untilDate = sinceDate + 1 day = today
      untilDate = new Date(todayUTC); 
      
      console.log(`Yesterday date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
      break;
    
    case 'previous_day':
      // Previous day (day before yesterday) is 2 days before today
      sinceDate = new Date(todayUTC);
      sinceDate.setDate(todayUTC.getDate() - 2);
      
      // For Meta API, untilDate needs to be the day AFTER sinceDate (exclusive bound)
      // So untilDate = sinceDate + 1 day = yesterday
      untilDate = new Date(todayUTC);
      untilDate.setDate(todayUTC.getDate() - 1);
      
      console.log(`Previous day date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
      break;
      
    case 'last_7d':
      // Last 7 days is from 7 days ago until yesterday (inclusive)
      sinceDate = new Date(todayUTC);
      sinceDate.setDate(todayUTC.getDate() - 7);
      
      // For Meta API, untilDate needs to be today to include yesterday
      untilDate = new Date(todayUTC);
      
      console.log(`Last 7 days date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
      break;
      
    case 'last_14d':
      // Last 14 days is from 14 days ago until yesterday (inclusive)
      sinceDate = new Date(todayUTC);
      sinceDate.setDate(todayUTC.getDate() - 14);
      
      // For Meta API, untilDate needs to be today to include yesterday
      untilDate = new Date(todayUTC);
      
      console.log(`Last 14 days date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
      break;
      
    case 'last_30d':
      // Last 30 days is from 30 days ago until yesterday (inclusive)
      sinceDate = new Date(todayUTC);
      sinceDate.setDate(todayUTC.getDate() - 30);
      
      // For Meta API, untilDate needs to be today to include yesterday
      untilDate = new Date(todayUTC);
      
      console.log(`Last 30 days date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
      break;
      
    case 'last_month':
      // Last month is the entire previous calendar month
      const lastMonth = new Date(todayUTC);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      // First day of last month
      sinceDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      
      // First day of current month (which is the day after the last day of the previous month)
      untilDate = new Date(todayUTC.getFullYear(), todayUTC.getMonth(), 1);
      
      console.log(`Last month date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
      break;
      
    default:
      // Default to last 7 days
      sinceDate = new Date(todayUTC);
      sinceDate.setDate(todayUTC.getDate() - 7);
      
      untilDate = new Date(todayUTC);
      
      console.log(`Default (last 7 days) date calculation:`);
      console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
      console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
  }

  // Format dates as YYYY-MM-DD for the Meta API
  const since = formatDate(sinceDate);
  const until = formatDate(untilDate);

  // Add detailed debug info to help diagnose any issues
  console.log(`Final date parameters: since=${since}, until=${until}, date_preset=${dateRange}`);
  console.log(`Meta API expects 'since' as inclusive and 'until' as exclusive bounds`);
  console.log(`The requested date range spans from ${since} (inclusive) to ${until} (exclusive)`);

  return { since, until, date_preset: dateRange };
}

// Add new Instagram-specific date params function
export function getInstagramDateParams(dateRange: string, customDateRange?: { from: string; to: string }): DateParams {
  // Handle custom date range if provided
  if (dateRange === 'custom' && customDateRange) {
    console.log(`Processing custom date range for Instagram: ${customDateRange.from} to ${customDateRange.to}`);
    
    // Parse the dates from strings to Date objects
    let fromDate = new Date(customDateRange.from);
    const toDate = new Date(customDateRange.to);
    
    console.log(`Custom date range parsed as: ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    
    // Check if the date range exceeds 30 days (Instagram API limit)
    const daysDifference = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > 30) {
      console.log(`Custom date range exceeds 30 days (${daysDifference} days), adjusting to last 30 days from the end date`);
      // Create a new date object 30 days before the end date
      const adjustedFromDate = new Date(toDate);
      adjustedFromDate.setDate(adjustedFromDate.getDate() - 30);
      fromDate = adjustedFromDate;
      console.log(`Adjusted from date to: ${fromDate.toISOString()}`);
    }
    
    return {
      since: formatDate(fromDate),
      until: formatDate(toDate),
      date_preset: 'custom'
    };
  }

  const nowUTC = new Date();
  const todayUTC = new Date(nowUTC.getFullYear(), nowUTC.getMonth(), nowUTC.getDate());
  console.log(`Current UTC time: ${nowUTC.toISOString()}`);
  console.log(`Today at midnight UTC: ${todayUTC.toISOString()}`);

  let sinceDate: Date;
  let untilDate: Date;

  // For Instagram, we need to ensure we don't exceed 30 days
  if (dateRange === 'last_month') {
    // Calculate the first day of previous month
    const lastMonth = new Date(todayUTC);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const firstDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    
    // Calculate the first day of current month (which is the end date, exclusive)
    const firstDayCurrentMonth = new Date(todayUTC.getFullYear(), todayUTC.getMonth(), 1);
    
    // If the range would exceed 30 days, take the last 30 days of the month
    const daysDifference = Math.floor((firstDayCurrentMonth.getTime() - firstDayLastMonth.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDifference > 30) {
      // Take the last 30 days by setting sinceDate to 30 days before the end of the month
      sinceDate = new Date(firstDayCurrentMonth);
      sinceDate.setDate(sinceDate.getDate() - 30);
      untilDate = firstDayCurrentMonth;
      
      console.log('Instagram date range exceeded 30 days, adjusting to last 30 days of the month');
    } else {
      sinceDate = firstDayLastMonth;
      untilDate = firstDayCurrentMonth;
    }
  } else {
    // For other date ranges, use the existing logic
    const params = getDateParams(dateRange);
    sinceDate = new Date(params.since);
    untilDate = new Date(params.until);
    
    // If any other range exceeds 30 days, limit it
    const daysDifference = Math.floor((untilDate.getTime() - sinceDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > 30) {
      sinceDate = new Date(untilDate);
      sinceDate.setDate(sinceDate.getDate() - 30);
    }
  }

  console.log(`Instagram date calculation for ${dateRange}:`);
  console.log(`- sinceDate (inclusive): ${sinceDate.toISOString()}`);
  console.log(`- untilDate (exclusive): ${untilDate.toISOString()}`);
  console.log(`- Days between: ${Math.floor((untilDate.getTime() - sinceDate.getTime()) / (1000 * 60 * 60 * 24))}`);

  return {
    since: formatDate(sinceDate),
    until: formatDate(untilDate),
    date_preset: dateRange
  };
}

// Get previous period date parameters based on the current period
export function getPreviousPeriodDateParams(dateRange: string, customDateRange?: { from: string; to: string }): DateParams | null {
  // For custom date range, calculate previous period
  if (dateRange === 'custom' && customDateRange) {
    const fromDate = new Date(customDateRange.from);
    const toDate = new Date(customDateRange.to);
    
    // Calculate the period duration in milliseconds
    const periodDuration = toDate.getTime() - fromDate.getTime();
    
    // Calculate previous period dates by shifting back by period duration
    const previousFromDate = new Date(fromDate.getTime() - periodDuration);
    const previousToDate = new Date(toDate.getTime() - periodDuration);
    
    return {
      since: formatDate(previousFromDate),
      until: formatDate(previousToDate),
      date_preset: `previous_custom`
    };
  }

  // For 30-day range, we cannot fetch previous period (API limitation)
  if (dateRange === 'last_30d' || dateRange === 'last_month') {
    console.log('Cannot calculate previous period for 30-day ranges due to API limitations');
    return null;
  }

  // Get current period params
  const currentParams = getDateParams(dateRange);
  
  // Calculate date objects from the string dates
  const sinceDateObj = new Date(currentParams.since);
  const untilDateObj = new Date(currentParams.until);
  
  // Calculate the period duration in milliseconds
  const periodDuration = untilDateObj.getTime() - sinceDateObj.getTime();
  
  // Calculate previous period dates by shifting back by period duration
  const previousSinceDateObj = new Date(sinceDateObj.getTime() - periodDuration);
  const previousUntilDateObj = new Date(untilDateObj.getTime() - periodDuration);
  
  console.log(`Previous period calculation for ${dateRange}:`);
  console.log(`- Current period: ${currentParams.since} to ${currentParams.until}`);
  console.log(`- Previous period: ${formatDate(previousSinceDateObj)} to ${formatDate(previousUntilDateObj)}`);
  
  return {
    since: formatDate(previousSinceDateObj),
    until: formatDate(previousUntilDateObj),
    date_preset: `previous_${dateRange}`
  };
}

// Get Instagram-specific previous period date parameters
export function getInstagramPreviousPeriodDateParams(dateRange: string, customDateRange?: { from: string; to: string }): DateParams | null {
  // For custom date range, calculate previous period
  if (dateRange === 'custom' && customDateRange) {
    const fromDate = new Date(customDateRange.from);
    const toDate = new Date(customDateRange.to);
    
    // Calculate the period duration in milliseconds
    const periodDuration = toDate.getTime() - fromDate.getTime();
    
    // Calculate previous period dates by shifting back by period duration
    let previousFromDate = new Date(fromDate.getTime() - periodDuration);
    const previousToDate = new Date(toDate.getTime() - periodDuration);
    
    // Check if the total range exceeds 30 days (Instagram API limit)
    const daysDifference = Math.floor((previousToDate.getTime() - previousFromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > 30) {
      console.log(`Previous period exceeds 30 days (${daysDifference} days), adjusting to last 30 days from the previous end date`);
      // Create a new date object 30 days before the previous end date
      const adjustedPreviousFromDate = new Date(previousToDate);
      adjustedPreviousFromDate.setDate(adjustedPreviousFromDate.getDate() - 30);
      previousFromDate = adjustedPreviousFromDate;
      console.log(`Adjusted previous from date to: ${previousFromDate.toISOString()}`);
    }
    
    return {
      since: formatDate(previousFromDate),
      until: formatDate(previousToDate),
      date_preset: `previous_custom`
    };
  }

  // For 30-day range, we cannot fetch previous period (API limitation)
  if (dateRange === 'last_30d' || dateRange === 'last_month') {
    console.log('Cannot calculate previous period for 30-day ranges due to Instagram API limitations');
    return null;
  }
  
  // Get current period params
  const currentParams = getInstagramDateParams(dateRange);
  
  // Calculate date objects from the string dates
  const sinceDateObj = new Date(currentParams.since);
  const untilDateObj = new Date(currentParams.until);
  
  // Calculate the period duration in milliseconds
  const periodDuration = untilDateObj.getTime() - sinceDateObj.getTime();
  
  // Calculate previous period dates by shifting back by period duration
  const previousSinceDateObj = new Date(sinceDateObj.getTime() - periodDuration);
  const previousUntilDateObj = new Date(untilDateObj.getTime() - periodDuration);
  
  console.log(`Instagram previous period calculation for ${dateRange}:`);
  console.log(`- Current period: ${currentParams.since} to ${currentParams.until}`);
  console.log(`- Previous period: ${formatDate(previousSinceDateObj)} to ${formatDate(previousUntilDateObj)}`);
  
  return {
    since: formatDate(previousSinceDateObj),
    until: formatDate(previousUntilDateObj),
    date_preset: `previous_${dateRange}`
  };
}
