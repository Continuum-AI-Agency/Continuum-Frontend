import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, RefreshCw, Instagram, Clock, AlertCircle, ArrowLeft, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CompetitorService } from '@/services/competitorService';
import { DashboardResponse } from '@/types/competitor-types';
import { CompetitorPostCard } from './CompetitorPostCard';
import { CompetitorFilters, type SortOption } from './CompetitorFilters';
import { CompetitorsList } from './CompetitorsList';

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
  
  const { toast } = useToast();

  // Sort posts based on selected criteria
  const sortedPosts = useMemo(() => {
    if (!dashboard?.posts) return [];
    return CompetitorService.sortPosts(dashboard.posts, sortBy);
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
        variant: 'destructive',
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
                console.log('Competitor may already exist in list');
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
          console.log('Competitor may already exist in list');
        }
        
        if (response.cache_age_seconds) {
          const ageMinutes = Math.floor(response.cache_age_seconds / 60);
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
        variant: 'destructive',
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
        variant: 'destructive',
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
            <Input
              placeholder={showDashboard ? "Search other competitor @username" : "Search competitor @username"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={isLoading}
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
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Scraping Instagram data for @{searchedUsername}. This usually takes 30-60 seconds...
              </AlertDescription>
            </Alert>
          )}

          {dashboard && dashboard.status === 'success' && dashboard.profile && (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {dashboard.profile.profile_pic_url && (
                    <img
                      src={CompetitorService.getProxiedImageUrl(dashboard.profile.profile_pic_url)}
                      alt={dashboard.profile.username}
                      className="w-16 h-16 rounded-full bg-muted"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = CompetitorService.getPlaceholderImage();
                        target.onerror = null;
                      }}
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold">@{dashboard.profile.username}</h2>
                      {dashboard.profile.verified && (
                        <Badge variant="secondary">✓ Verified</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {CompetitorService.formatNumber(dashboard.profile.followers_count)} followers
                    </p>
                    {dashboard.profile.biography && (
                      <p className="text-sm mt-2">{dashboard.profile.biography}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {dashboard.cache_age_seconds !== undefined && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{CompetitorService.getTimeAgo(dashboard.cache_age_seconds)}</span>
                      {CompetitorService.isCacheOld(dashboard.cache_age_seconds) && (
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
                        Math.round(dashboard.posts.reduce((sum, p) => sum + p.likes_count, 0) / dashboard.posts.length)
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
                        Math.round(dashboard.posts.reduce((sum, p) => sum + p.comments_count, 0) / dashboard.posts.length)
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
                    key={post.id} 
                    post={post}
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
