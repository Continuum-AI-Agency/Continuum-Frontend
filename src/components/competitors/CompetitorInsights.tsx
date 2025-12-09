import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge, Callout } from '@radix-ui/themes';
import { Loader2, Search, RefreshCw, Instagram, Clock, AlertCircle, ArrowLeft, Lock } from 'lucide-react';
import { useToast } from "@/components/ui/ToastProvider";
import { CompetitorService } from '@/services/competitorService';
import { DashboardResponse } from '@/types/competitor-types';
import { CompetitorPostCard } from './CompetitorPostCard';
import { CompetitorFilters, type SortOption } from './CompetitorFilters';
import { CompetitorsList } from './CompetitorsList';

type CardProps = { children: React.ReactNode; className?: string };
const Card = ({ children, className }: CardProps) => (
  <div className={`rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm ${className ?? ""}`}>
    {children}
  </div>
);
const CardHeader = ({ children, className }: CardProps) => <div className={`mb-3 ${className ?? ""}`}>{children}</div>;
const CardTitle = ({ children, className }: CardProps) => (
  <h3 className={`text-lg font-semibold leading-tight ${className ?? ""}`}>{children}</h3>
);
const CardDescription = ({ children, className }: CardProps) => (
  <p className={`text-sm text-gray-400 ${className ?? ""}`}>{children}</p>
);
const CardContent = ({ children, className }: CardProps) => <div className={className}>{children}</div>;

interface CompetitorInsightsProps {
  instagramBusinessAccountId?: string;
}

export const CompetitorInsights = ({ instagramBusinessAccountId }: CompetitorInsightsProps) => {
  const [username, setUsername] = useState('');
  const [searchedUsername, setSearchedUsername] = useState('');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('recent-desc');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  
  const { show: toast } = useToast();

  // Sort posts based on selected criteria
  const sortedPosts = useMemo(() => {
    if (!dashboard?.posts) return [];
    const normalized = dashboard.posts.map((post) => ({
      ...post,
      likes_count: post.likesCount,
      comments_count: post.commentsCount,
      views: (post as { views?: number }).views ?? (post as { impressions?: number }).impressions,
    }));
    return CompetitorService.sortPosts(normalized, sortBy);
  }, [dashboard?.posts, sortBy]);

  const handleViewCompetitor = (targetUsername: string) => {
    setUsername(''); // Keep input empty to show placeholder
    setSearchedUsername(targetUsername);
    setShowDashboard(true);
    loadDashboard(targetUsername, false);
  };

  const handleBackToList = () => {
    setShowDashboard(false);
    setDashboard(null);
    setSearchedUsername('');
    setUsername('');
    setErrorMessage(null);
    setListKey(prev => prev + 1);
  };
  
  const [listKey, setListKey] = useState(0);

  const handleSearch = async () => {
    if (!username.trim()) {
      toast({
        title: 'Username Required',
        description: 'Please enter an Instagram username to analyze.',
        variant: 'error',
      });
      return;
    }

    const cleanUsername = username.replace('@', '').trim();
    setSearchedUsername(cleanUsername);
    setShowDashboard(true);
    setUsername('');
    
    await loadDashboard(cleanUsername, false);
  };

  const loadDashboard = async (targetUsername: string, forceRefresh: boolean = false) => {
    setIsLoading(true);
    setErrorMessage(null); // Clear any previous errors
    try {
      const response = await CompetitorService.getCompetitorDashboard(targetUsername, forceRefresh);
      
      if (response.status === 'scraping') {
        toast({
          title: 'Scraping Instagram',
          description: 'Fetching data from Instagram. This usually takes 30-60 seconds. Please wait...',
        });
        
        const pollInterval = setInterval(async () => {
          try {
            const pollResponse = await CompetitorService.getCompetitorDashboard(targetUsername, false);
            if (pollResponse.status === 'success') {
              setDashboard(pollResponse);
              setErrorMessage(null);
              clearInterval(pollInterval);
              setIsLoading(false);
              
              try {
                if (instagramBusinessAccountId) {
                  await CompetitorService.addCompetitor(targetUsername, instagramBusinessAccountId);
                }
              } catch (error) {
                console.log('Competitor may already exist in list', error);
              }
              
              toast({
                title: 'Data Ready!',
                description: `Successfully loaded ${pollResponse.posts.length} posts for @${targetUsername}`,
              });
            }
          } catch (error) {
            console.error('Error polling:', error);
          }
        }, 10000);
        
        setTimeout(() => {
          clearInterval(pollInterval);
          setIsLoading(false);
        }, 120000);
        
      } else if (response.status === 'success') {
        setDashboard(response);
        setErrorMessage(null);
        
        try {
          if (instagramBusinessAccountId) {
            await CompetitorService.addCompetitor(targetUsername, instagramBusinessAccountId);
          }
        } catch (error) {
          console.log('Competitor may already exist in list', error);
        }
        
        if (response.cacheAgeSeconds) {
          const ageMinutes = Math.floor(response.cacheAgeSeconds / 60);
          if (ageMinutes > 0) {
            toast({
              title: 'Data Loaded',
              description: `Showing cached data from ${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} ago`,
            });
          }
        }
      } else if (response.status === 'error') {
        setDashboard(null);
        setErrorMessage(response.message || 'Failed to load competitor data');
      }
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast({
        title: 'Error Loading Data',
        description: error instanceof Error ? error.message : 'Failed to load competitor data',
        variant: 'error',
      });
    } finally {
      if (dashboard?.status !== 'scraping') {
        setIsLoading(false);
      }
    }
  };

  const handleRefresh = async () => {
    if (!searchedUsername) return;
    
    setIsRefreshing(true);
    try {
      await CompetitorService.invalidateCache(searchedUsername);
      
      toast({
        title: 'Refreshing Data',
        description: 'Fetching fresh data from Instagram...',
      });
      
      await loadDashboard(searchedUsername, true);
      
    } catch (error) {
      console.error('Error refreshing:', error);
      toast({
        title: 'Error',
        description: 'Failed to refresh data',
        variant: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            {showDashboard && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackToList}
                className="shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Instagram className="h-5 w-5" />
                Competitor Analysis
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              placeholder={showDashboard ? "Search other competitor @username" : "Search competitor @username"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={isLoading}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-400 focus:border-white/40 focus:outline-none"
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!showDashboard && instagramBusinessAccountId && (
        <CompetitorsList 
          key={listKey} 
          onViewCompetitor={handleViewCompetitor} 
          instagramBusinessAccountId={instagramBusinessAccountId}
        />
      )}

      {showDashboard && (
        <>
          {isLoading && dashboard?.status === 'scraping' && (
            <Callout.Root variant="surface" color="yellow">
              <Callout.Icon>
                <Loader2 className="h-4 w-4 animate-spin" />
              </Callout.Icon>
              <Callout.Text>
                Scraping Instagram data for @{searchedUsername}. This usually takes 30-60 seconds...
              </Callout.Text>
            </Callout.Root>
          )}

          {dashboard && dashboard.status === 'success' && dashboard.profile && (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {dashboard.profile.profilePicUrl && (
                    <Image
                      src={CompetitorService.getProxiedImageUrl(dashboard.profile.profilePicUrl)}
                      alt={dashboard.profile.username}
                      width={64}
                      height={64}
                      unoptimized
                      className="w-16 h-16 rounded-full bg-muted"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.src = CompetitorService.getPlaceholderImage();
                        target.onerror = null;
                      }}
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold">@{dashboard.profile.username}</h2>
                      {dashboard.profile.verified && (
                        <Badge variant="soft" color="green">✓ Verified</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {CompetitorService.formatNumber(dashboard.profile.followersCount)} followers
                    </p>
                    {dashboard.profile.biography && (
                      <p className="text-sm mt-2">{dashboard.profile.biography}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {dashboard.cacheAgeSeconds !== undefined && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{CompetitorService.getTimeAgo(dashboard.cacheAgeSeconds)}</span>
                      {CompetitorService.isCacheOld(dashboard.cacheAgeSeconds) && (
                        <AlertCircle className="h-4 w-4 text-yellow-500 ml-1" />
                      )}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.posts.length}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Likes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboard.posts.length > 0
                    ? CompetitorService.formatNumber(
                        Math.round(dashboard.posts.reduce((sum, p) => sum + p.likesCount, 0) / dashboard.posts.length)
                      )
                    : '0'}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboard.posts.length > 0
                    ? CompetitorService.formatNumber(
                        Math.round(dashboard.posts.reduce((sum, p) => sum + p.commentsCount, 0) / dashboard.posts.length)
                      )
                    : '0'}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Post Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  {dashboard.posts.filter(p => p.type === 'Sidecar').length} 📸{' '}
                  {dashboard.posts.filter(p => p.type === 'Video').length} ▶️{' '}
                  {dashboard.posts.filter(p => p.type === 'Image').length} 🖼️
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Posts</CardTitle>
              <CardDescription>
                Showing {dashboard.posts.length} most recent posts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompetitorFilters
                sortBy={sortBy}
                onSortChange={setSortBy}
                totalPosts={dashboard.posts.length}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
            {sortedPosts.map((post) => (
              <CompetitorPostCard 
                key={post.id as string}
                post={{
                  ...(post as unknown as { id: string; timestamp: string }),
                  likesCount: post.likes_count,
                  commentsCount: post.comments_count,
                  mediaUrls: (post as { mediaUrls?: string[] }).mediaUrls,
                  hashtags: (post as { hashtags?: string[] }).hashtags,
                  type: (post as { type?: string }).type,
                  caption: (post as { caption?: string }).caption,
                  views: (post as { views?: number }).views,
                  isPinned: (post as { isPinned?: boolean }).isPinned,
                  timestamp: (post as { timestamp: string }).timestamp,
                  id: (post as { id: string }).id ?? String(post.id),
                }}
              />
            ))}
              </div>

              {dashboard.posts.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Instagram className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No posts found for this competitor</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

          {errorMessage && !isLoading && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
              <CardContent className="flex flex-col items-center justify-center py-12">
                {errorMessage.toLowerCase().includes('private') ? (
                  <>
                    <Lock className="h-16 w-16 text-blue-600 dark:text-blue-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-200">
                      Private Profile
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 text-center max-w-md mb-2">
                      @{searchedUsername} has a private Instagram account.
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 text-center max-w-md">
                      Competitor analysis only works with public profiles. Please try a different account.
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-16 w-16 text-blue-600 dark:text-blue-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-200">
                      Profile Not Found
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 text-center max-w-md">
                      {errorMessage}
                    </p>
                  </>
                )}
                <Button
                  variant="outline"
                  className="mt-6"
                  onClick={() => {
                    setErrorMessage(null);
                    setSearchedUsername('');
                    setUsername('');
                    setShowDashboard(false);
                  }}
                >
                  Try Another Username
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
