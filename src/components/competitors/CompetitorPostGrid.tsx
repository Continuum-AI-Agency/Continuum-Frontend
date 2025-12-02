import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  Heart, 
  MessageCircle, 
  Eye, 
  TrendingUp,
  Calendar,
  Hash,
  MapPin,
  Play,
  Pause
} from 'lucide-react';
import { CompetitorPost } from '@/types/competitor-types';
import { CompetitorService } from '@/services/competitorService';

interface CompetitorPostGridProps {
  posts: CompetitorPost[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

interface PostCardProps {
  post: CompetitorPost;
}

const PostCard = ({ post }: PostCardProps) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const nextMedia = () => {
    if (post.media.length > 1) {
      setCurrentMediaIndex((prev) => (prev + 1) % post.media.length);
    }
  };

  const prevMedia = () => {
    if (post.media.length > 1) {
      setCurrentMediaIndex((prev) => (prev - 1 + post.media.length) % post.media.length);
    }
  };

  const handleVideoClick = () => {
    setIsVideoPlaying(!isVideoPlaying);
  };

  const currentMedia = post.media[currentMediaIndex];
  const isVideo = currentMedia?.media_type === 'Video';
  const hasMultipleMedia = post.media.length > 1;

  const displayUrl = imageError ? CompetitorService.getPlaceholderImage() : 
                    CompetitorService.isValidImageUrl(currentMedia?.display_url || '') ? 
                    currentMedia?.display_url : CompetitorService.getPlaceholderImage();

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200">
      {/* Media Section */}
      <div className="relative aspect-square bg-muted">
        {isVideo && currentMedia?.video_url && !imageError ? (
          <div className="relative w-full h-full">
            <video
              src={currentMedia.video_url}
              poster={currentMedia.display_url}
              className="w-full h-full object-cover"
              controls={isVideoPlaying}
              muted
              playsInline
              onError={handleImageError}
            />
            {!isVideoPlaying && (
              <button
                onClick={handleVideoClick}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
              >
                <div className="bg-white/90 rounded-full p-3">
                  <Play className="h-6 w-6 text-black" />
                </div>
              </button>
            )}
          </div>
        ) : (
          <img
            src={displayUrl}
            alt={post.accessibility_caption || 'Instagram post'}
            className="w-full h-full object-cover"
            onError={handleImageError}
          />
        )}

        {/* Media Navigation */}
        {hasMultipleMedia && (
          <>
            <button
              onClick={prevMedia}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextMedia}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            
            {/* Media Indicators */}
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
              {post.media.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentMediaIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Post Type Badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="text-xs">
            {CompetitorService.getPostTypeIcon(post.type, post.product_type)}
            {post.product_type === 'reel' ? 'Reel' : post.type}
          </Badge>
        </div>

        {/* Open in Instagram Button */}
        <div className="absolute top-2 right-2">
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/90 hover:bg-white text-black"
            onClick={() => window.open(post.openUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content Section */}
      <CardContent className="p-4 space-y-3">
        {/* Engagement Metrics */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-1">
            <Heart className="h-4 w-4 text-red-500" />
            <span className="font-medium">{CompetitorService.formatNumber(post.likes_count)}</span>
          </div>
          <div className="flex items-center space-x-1">
            <MessageCircle className="h-4 w-4 text-green-500" />
            <span className="font-medium">{CompetitorService.formatNumber(post.comments_count)}</span>
          </div>
          {post.views && (
            <div className="flex items-center space-x-1">
              <Eye className="h-4 w-4 text-orange-500" />
              <span className="font-medium">{CompetitorService.formatNumber(post.views)}</span>
            </div>
          )}
          {post.engagement_rate && (
            <div className="flex items-center space-x-1">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="font-medium">{CompetitorService.formatEngagementRate(post.engagement_rate)}</span>
            </div>
          )}
        </div>

        {/* Caption */}
        {post.caption && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {CompetitorService.truncateCaption(post.caption)}
          </p>
        )}

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="flex items-center space-x-1">
            <Hash className="h-3 w-3 text-muted-foreground" />
            <div className="flex flex-wrap gap-1">
              {CompetitorService.extractDisplayHashtags(post.hashtags).map((hashtag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {hashtag}
                </Badge>
              ))}
              {post.hashtags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{post.hashtags.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        {post.location_name && (
          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{post.location_name}</span>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{new Date(post.created_at).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const PostSkeleton = () => (
  <Card className="overflow-hidden">
    <div className="aspect-square">
      <Skeleton className="w-full h-full" />
    </div>
    <CardContent className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="flex space-x-1">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-6 w-12" />
      </div>
    </CardContent>
  </Card>
);

export const CompetitorPostGrid = ({ posts, pagination, onPageChange, isLoading }: CompetitorPostGridProps) => {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: pagination.pageSize }).map((_, index) => (
            <PostSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-muted-foreground">
            <Calendar className="mx-auto h-12 w-12 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Posts Found</h3>
            <p>No posts found in the selected time range. Try adjusting your filters or check back later.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Posts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {posts.map((post) => (
          <PostCard key={post.post_id} post={post} />
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const pageNumber = i + 1;
              return (
                <Button
                  key={pageNumber}
                  variant={pageNumber === pagination.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNumber)}
                  className="w-10"
                >
                  {pageNumber}
                </Button>
              );
            })}
            
            {pagination.totalPages > 5 && (
              <>
                {pagination.totalPages > 6 && <span className="text-muted-foreground">...</span>}
                <Button
                  variant={pagination.totalPages === pagination.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pagination.totalPages)}
                  className="w-10"
                >
                  {pagination.totalPages}
                </Button>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Results Summary */}
      <div className="text-center text-sm text-muted-foreground">
        Showing {posts.length} of {pagination.total.toLocaleString()} posts
        {pagination.totalPages > 1 && (
          <span> (Page {pagination.page} of {pagination.totalPages})</span>
        )}
      </div>
    </div>
  );
};
