import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Eye, TrendingUp, BarChart3, Calendar } from 'lucide-react';
import { CompetitorPost, CompetitorInfo } from '@/types/competitor-types';
import { CompetitorService } from '@/services/competitorService';

interface CompetitorStatsProps {
  posts: CompetitorPost[];
  competitor: CompetitorInfo;
}

export const CompetitorStats = ({ posts, competitor }: CompetitorStatsProps) => {
  // Calculate statistics
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((sum, post) => sum + post.likes_count, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.comments_count, 0);
  const totalViews = posts.reduce((sum, post) => sum + (post.views || 0), 0);
  
  const avgLikes = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;
  const avgComments = totalPosts > 0 ? Math.round(totalComments / totalPosts) : 0;
  const avgViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;
  
  // Calculate engagement rates
  const postsWithEngagement = posts.filter(post => post.engagement_rate !== undefined);
  const avgEngagementRate = postsWithEngagement.length > 0 
    ? postsWithEngagement.reduce((sum, post) => sum + (post.engagement_rate || 0), 0) / postsWithEngagement.length
    : 0;

  // Find best performing post
  const bestPost = posts.reduce((best, current) => {
    const currentEngagement = (current.likes_count + current.comments_count);
    const bestEngagement = (best.likes_count + best.comments_count);
    return currentEngagement > bestEngagement ? current : best;
  }, posts[0]);

  // Post type distribution
  const postTypes = posts.reduce((acc, post) => {
    const type = post.product_type === 'reel' ? 'Reels' : 
                 post.type === 'Video' ? 'Videos' :
                 post.type === 'Sidecar' ? 'Carousels' : 'Images';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Recent activity
  const now = new Date();
  const recentPosts = posts.filter(post => {
    const postDate = new Date(post.created_at);
    const daysDiff = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  }).length;

  const stats = [
    {
      title: 'Total Posts',
      value: totalPosts.toLocaleString(),
      icon: BarChart3,
      description: 'In selected period',
      color: 'text-blue-600',
    },
    {
      title: 'Avg Likes',
      value: CompetitorService.formatNumber(avgLikes),
      icon: Heart,
      description: `${CompetitorService.formatNumber(totalLikes)} total`,
      color: 'text-red-600',
    },
    {
      title: 'Avg Comments',
      value: CompetitorService.formatNumber(avgComments),
      icon: MessageCircle,
      description: `${CompetitorService.formatNumber(totalComments)} total`,
      color: 'text-green-600',
    },
    {
      title: 'Avg Engagement',
      value: CompetitorService.formatEngagementRate(avgEngagementRate),
      icon: TrendingUp,
      description: 'Engagement rate',
      color: 'text-purple-600',
    },
    ...(totalViews > 0 ? [{
      title: 'Avg Views',
      value: CompetitorService.formatNumber(avgViews),
      icon: Eye,
      description: `${CompetitorService.formatNumber(totalViews)} total`,
      color: 'text-orange-600',
    }] : []),
    {
      title: 'Recent Activity',
      value: recentPosts.toString(),
      icon: Calendar,
      description: 'Posts this week',
      color: 'text-indigo-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </span>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Additional Insights */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Post Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(postTypes).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{type}</span>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      {count}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {((count / totalPosts) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Best Performing Post */}
        {bestPost && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Performing Post</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">
                    {CompetitorService.getPostTypeIcon(bestPost.type, bestPost.product_type)} 
                    {bestPost.product_type === 'reel' ? 'Reel' : bestPost.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(bestPost.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <Heart className="h-3 w-3 text-red-500" />
                    <span>{CompetitorService.formatNumber(bestPost.likes_count)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <MessageCircle className="h-3 w-3 text-green-500" />
                    <span>{CompetitorService.formatNumber(bestPost.comments_count)}</span>
                  </div>
                  {bestPost.views && (
                    <div className="flex items-center space-x-1">
                      <Eye className="h-3 w-3 text-orange-500" />
                      <span>{CompetitorService.formatNumber(bestPost.views)}</span>
                    </div>
                  )}
                  {bestPost.engagement_rate && (
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="h-3 w-3 text-purple-500" />
                      <span>{CompetitorService.formatEngagementRate(bestPost.engagement_rate)}</span>
                    </div>
                  )}
                </div>

                {bestPost.caption && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {CompetitorService.truncateCaption(bestPost.caption, 80)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
