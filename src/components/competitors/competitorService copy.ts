import { DashboardResponse, CompetitorInfo } from '@/types/competitor-types';

const API_BASE_URL = import.meta.env.VITE_COMPETITORS_API_URL || 'https://api.beparsed.com/api/competitors';

export class CompetitorService {
  
  /**
   * Get platform account's saved competitors list
   */
  static async getUserCompetitors(platformAccountId: string): Promise<CompetitorInfo[]> {
    const url = `${API_BASE_URL}/?platform_account_id=${encodeURIComponent(platformAccountId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Error fetching user competitors:', errorData);
      throw new Error(`Failed to fetch competitors: ${errorData.detail || response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Add competitor to platform account's list
   */
  static async addCompetitor(username: string, platformAccountId: string): Promise<void> {
    const cleanUsername = username.replace('@', '').trim();
    const url = `${API_BASE_URL}/add?platform_account_id=${encodeURIComponent(platformAccountId)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: cleanUsername }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Error adding competitor:', errorData);
      throw new Error(`Failed to add competitor: ${errorData.detail || response.statusText}`);
    }
  }

  /**
   * Remove competitor from platform account's list
   */
  static async removeCompetitor(username: string, platformAccountId: string): Promise<void> {
    const cleanUsername = username.replace('@', '').trim();
    const url = `${API_BASE_URL}/${cleanUsername}?platform_account_id=${encodeURIComponent(platformAccountId)}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Error removing competitor:', errorData);
      throw new Error(`Failed to remove competitor: ${errorData.detail || response.statusText}`);
    }
  }
  
  /**
   * Get competitor dashboard (profile + posts with fresh media URLs)
   * This is the main endpoint in v2.0
   */
  static async getCompetitorDashboard(
    username: string,
    forceRefresh: boolean = false
  ): Promise<DashboardResponse> {
    const cleanUsername = username.replace('@', '').trim();
    const params = new URLSearchParams();
    
    if (forceRefresh) {
      params.append('force', 'true');
    }

    const url = `${API_BASE_URL}/${cleanUsername}/dashboard?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Error fetching competitor dashboard:', errorData);
      throw new Error(`Failed to fetch dashboard: ${errorData.detail || response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Invalidate cache and force refresh on next request
   */
  static async invalidateCache(username: string): Promise<void> {
    const cleanUsername = username.replace('@', '').trim();
    const url = `${API_BASE_URL}/${cleanUsername}/refresh`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Error invalidating cache:', errorData);
      throw new Error(`Failed to invalidate cache: ${errorData.detail || response.statusText}`);
    }
  }

  /**
   * Proxy Instagram image URL through backend to bypass CORS
   */
  static getProxiedImageUrl(imageUrl: string): string {
    if (!imageUrl) return CompetitorService.getPlaceholderImage();
    
    // If it's an Instagram/Facebook CDN URL, proxy it
    const needsProxy = imageUrl.includes('cdninstagram.com') || 
                      imageUrl.includes('fbcdn') || 
                      imageUrl.includes('scontent');
    
    if (needsProxy) {
      const baseUrl = API_BASE_URL.replace('/competitors', '/competitors/proxy/image');
      return `${baseUrl}?url=${encodeURIComponent(imageUrl)}`;
    }
    
    return imageUrl;
  }

  /**
   * Get Instagram post URL
   */
  static getPostOpenUrl(short_code?: string, product_type?: string): string {
    if (!short_code) return '#';
    
    if (product_type === 'reel') {
      return `https://www.instagram.com/reel/${short_code}/`;
    }
    return `https://www.instagram.com/p/${short_code}/`;
  }

  /**
   * Get time ago string for cache age
   */
  static getTimeAgo(seconds?: number): string {
    if (!seconds) return 'Just now';
    
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(seconds / 3600);
    const days = Math.floor(seconds / 86400);
    
    if (minutes < 60) {
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (hours < 24) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else {
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
  }

  /**
   * Check if cache is old (> 45 minutes)
   */
  static isCacheOld(seconds?: number): boolean {
    if (!seconds) return false;
    return seconds > 45 * 60; // 45 minutes
  }

  /**
   * Calculate engagement rate for videos
   * Formula: ((likes + comments) / views) × 100
   */
  static calculateVideoEngagementRate(likes: number, comments: number, views: number): number {
    if (views === 0) return 0;
    return ((likes + comments) / views) * 100;
  }

  /**
   * Format engagement rate as percentage
   */
  static formatEngagementRate(rate?: number): string {
    if (rate === undefined || rate === null) return 'N/A';
    return `${rate.toFixed(2)}%`;
  }

  /**
   * Format number with k/M suffix
   */
  static formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  }

  /**
   * Get post type icon
   */
  static getPostTypeIcon(type: string, productType?: string): string {
    if (productType === 'reel') return '🎬';
    if (type === 'Video') return '▶️';
    if (type === 'Sidecar') return '📸';
    return '🖼️';
  }

  /**
   * Extract hashtags from caption for display
   */
  static extractDisplayHashtags(hashtags: string[], maxCount: number = 3): string[] {
    return hashtags.slice(0, maxCount);
  }

  /**
   * Truncate caption for display
   */
  static truncateCaption(caption: string, maxLength: number = 120): string {
    if (!caption) return '';
    if (caption.length <= maxLength) return caption;
    return caption.substring(0, maxLength) + '...';
  }

  /**
   * Check if URL is valid
   */
  static isValidImageUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http') && (url.includes('instagram') || url.includes('fbcdn') || url.includes('cdninstagram'));
    } catch {
      return false;
    }
  }

  /**
   * Get placeholder image URL
   */
  static getPlaceholderImage(): string {
    return '/placeholder.svg';
  }

  /**
   * Get first media URL from post (with proxy)
   */
  static getFirstMediaUrl(post: {
    carousel_items?: { url: string }[];
    media_urls?: string[];
  }): string {
    let url: string | undefined;
    
    // Try carousel items first
    if (post.carousel_items && post.carousel_items.length > 0) {
      url = post.carousel_items[0].url;
    }
    // Try media_urls
    else if (post.media_urls && post.media_urls.length > 0) {
      url = post.media_urls[0];
    }
    
    if (!url) {
      return CompetitorService.getPlaceholderImage();
    }
    
    return CompetitorService.getProxiedImageUrl(url);
  }

  /**
   * Sort posts by different criteria
   */
  static sortPosts(
    posts: Array<{
      timestamp: string;
      likes_count: number;
      comments_count: number;
      views?: number;
    }>,
    sortBy: string
  ) {
    const sorted = [...posts];
    
    switch (sortBy) {
      case 'recent-desc':
        return sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      case 'recent-asc':
        return sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      case 'likes-desc':
        return sorted.sort((a, b) => b.likes_count - a.likes_count);
      
      case 'likes-asc':
        return sorted.sort((a, b) => a.likes_count - b.likes_count);
      
      case 'views-desc':
        return sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
      
      case 'views-asc':
        return sorted.sort((a, b) => (a.views || 0) - (b.views || 0));
      
      case 'engagement-desc':
        return sorted.sort((a, b) => {
          const engagementA = a.views 
            ? CompetitorService.calculateVideoEngagementRate(a.likes_count, a.comments_count, a.views)
            : 0;
          const engagementB = b.views 
            ? CompetitorService.calculateVideoEngagementRate(b.likes_count, b.comments_count, b.views)
            : 0;
          return engagementB - engagementA;
        });
      
      case 'engagement-asc':
        return sorted.sort((a, b) => {
          const engagementA = a.views 
            ? CompetitorService.calculateVideoEngagementRate(a.likes_count, a.comments_count, a.views)
            : 0;
          const engagementB = b.views 
            ? CompetitorService.calculateVideoEngagementRate(b.likes_count, b.comments_count, b.views)
            : 0;
          return engagementA - engagementB;
        });
      
      default:
        return sorted;
    }
  }
}
