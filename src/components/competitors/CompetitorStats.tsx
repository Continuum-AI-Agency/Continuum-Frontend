import { Badge, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { BarChart3, Calendar, Eye, Heart, MessageCircle, TrendingUp } from "lucide-react";

import { CompetitorService } from "@/services/competitorService";
import type { CompetitorPost } from "@/types/competitor-types";

interface CompetitorStatsProps {
  posts: CompetitorPost[];
}

const getLikes = (post: CompetitorPost): number =>
  (post as { likes_count?: number }).likes_count ?? post.likesCount ?? 0;

const getComments = (post: CompetitorPost): number =>
  (post as { comments_count?: number }).comments_count ?? post.commentsCount ?? 0;

const getViews = (post: CompetitorPost): number =>
  (post as { views?: number }).views ??
  (post as { impressions?: number }).impressions ??
  post.views ??
  0;

const getEngagementRate = (post: CompetitorPost): number | null =>
  (post as { engagement_rate?: number }).engagement_rate ??
  (post.views ? CompetitorService.calculateVideoEngagementRate(getLikes(post), getComments(post), post.views) : null);

const getProductType = (post: CompetitorPost): string =>
  (post as { product_type?: string }).product_type ?? post.productType ?? "";

const getTimestamp = (post: CompetitorPost): string =>
  (post as { created_at?: string }).created_at ?? post.timestamp ?? "";

const getTypeLabel = (post: CompetitorPost): string => {
  const productType = getProductType(post).toLowerCase();
  const type = (post.type ?? "").toLowerCase();
  if (productType === "reel" || type === "reel") return "Reels";
  if (type === "video") return "Videos";
  if (type === "sidecar") return "Carousels";
  return "Images";
};

export const CompetitorStats = ({ posts }: CompetitorStatsProps) => {
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((sum, post) => sum + getLikes(post), 0);
  const totalComments = posts.reduce((sum, post) => sum + getComments(post), 0);
  const totalViews = posts.reduce((sum, post) => sum + getViews(post), 0);

  const avgLikes = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;
  const avgComments = totalPosts > 0 ? Math.round(totalComments / totalPosts) : 0;
  const avgViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;

  const postsWithEngagement = posts.filter((post) => getEngagementRate(post) !== null);
  const avgEngagementRate =
    postsWithEngagement.length > 0
      ? postsWithEngagement.reduce((sum, post) => sum + (getEngagementRate(post) ?? 0), 0) /
        postsWithEngagement.length
      : 0;

  const bestPost = posts.reduce<CompetitorPost | null>((best, current) => {
    if (!best) return current;
    const currentEngagement = getLikes(current) + getComments(current);
    const bestEngagement = getLikes(best) + getComments(best);
    return currentEngagement > bestEngagement ? current : best;
  }, null);

  const postTypes = posts.reduce<Record<string, number>>((acc, post) => {
    const label = getTypeLabel(post);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const recentPosts = posts.filter((post) => {
    const timestamp = getTimestamp(post);
    if (!timestamp) return false;
    const postDate = new Date(timestamp);
    if (Number.isNaN(postDate.getTime())) return false;
    const daysDiff = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  }).length;

  const stats = [
    {
      title: "Total Posts",
      value: totalPosts.toLocaleString(),
      icon: BarChart3,
      description: "In selected period",
      color: "text-blue-600",
    },
    {
      title: "Avg Likes",
      value: CompetitorService.formatNumber(avgLikes),
      icon: Heart,
      description: `${CompetitorService.formatNumber(totalLikes)} total`,
      color: "text-red-600",
    },
    {
      title: "Avg Comments",
      value: CompetitorService.formatNumber(avgComments),
      icon: MessageCircle,
      description: `${CompetitorService.formatNumber(totalComments)} total`,
      color: "text-green-600",
    },
    {
      title: "Avg Engagement",
      value: CompetitorService.formatEngagementRate(avgEngagementRate),
      icon: TrendingUp,
      description: "Engagement rate",
      color: "text-purple-600",
    },
    ...(totalViews > 0
      ? [
          {
            title: "Avg Views",
            value: CompetitorService.formatNumber(avgViews),
            icon: Eye,
            description: `${CompetitorService.formatNumber(totalViews)} total`,
            color: "text-orange-600",
          },
        ]
      : []),
    {
      title: "Recent Activity",
      value: recentPosts.toString(),
      icon: Calendar,
      description: "Posts this week",
      color: "text-indigo-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="border border-white/10 bg-white/5 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <Text size="2" color="gray">
                {stat.title}
              </Text>
            </div>
            <div className="mt-2">
              <Text as="div" size="6" weight="bold">
                {stat.value}
              </Text>
              <Text size="1" color="gray">
                {stat.description}
              </Text>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-white/10 bg-white/5 p-4 shadow-sm">
          <Heading size="4" weight="bold" className="mb-3">
            Content Types
          </Heading>
          <div className="space-y-2">
            {Object.entries(postTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <Text size="2" weight="medium">
                  {type}
                </Text>
                <Flex align="center" gap="2">
                  <Badge variant="soft" color="gray" radius="full" className="text-xs">
                    {count}
                  </Badge>
                  <Text size="1" color="gray">
                    {totalPosts > 0 ? ((count / totalPosts) * 100).toFixed(1) : "0.0"}%
                  </Text>
                </Flex>
              </div>
            ))}
          </div>
        </Card>

        {bestPost && (
          <Card className="border border-white/10 bg-white/5 p-4 shadow-sm">
            <Heading size="4" weight="bold" className="mb-3">
              Top Performing Post
            </Heading>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" color="indigo" className="text-xs">
                  {CompetitorService.getPostTypeIcon(bestPost.type ?? "", getProductType(bestPost))}
                  {getProductType(bestPost) === "reel" ? "Reel" : bestPost.type}
                </Badge>
                <Text size="1" color="gray">
                  {(() => {
                    const timestamp = getTimestamp(bestPost);
                    return timestamp ? new Date(timestamp).toLocaleDateString() : "Unknown date";
                  })()}
                </Text>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Heart className="h-3 w-3 text-red-500" />
                  <span>{CompetitorService.formatNumber(getLikes(bestPost))}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3 text-green-500" />
                  <span>{CompetitorService.formatNumber(getComments(bestPost))}</span>
                </div>
                {getViews(bestPost) > 0 && (
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3 text-orange-500" />
                    <span>{CompetitorService.formatNumber(getViews(bestPost))}</span>
                  </div>
                )}
                {getEngagementRate(bestPost) !== null && (
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-purple-500" />
                    <span>{CompetitorService.formatEngagementRate(getEngagementRate(bestPost) ?? 0)}</span>
                  </div>
                )}
              </div>

              {bestPost.caption && (
                <Text size="1" color="gray" className="line-clamp-2">
                  {CompetitorService.truncateCaption(bestPost.caption, 80)}
                </Text>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
