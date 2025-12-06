import { useState } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight, ExternalLink, Heart, MessageCircle, Eye, TrendingUp } from 'lucide-react';
import { CompetitorService } from '@/services/competitorService';
import type { DashboardPost } from '@/types/competitor-types';

interface CompetitorPostCardProps {
  post: DashboardPost;
}

export const CompetitorPostCard = ({ post }: CompetitorPostCardProps) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  const allMedia = post.carousel_items.length > 0 
    ? post.carousel_items 
    : post.media_urls.map(url => ({ type: post.type === 'Video' ? 'video' : 'image' as const, url }));

  const hasMultipleMedia = allMedia.length > 1;
  const currentMedia = allMedia[currentMediaIndex];
  
  const engagementRate = post.views 
    ? CompetitorService.calculateVideoEngagementRate(
        post.likes_count,
        post.comments_count,
        post.views
      )
    : null;

  const goToNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentMediaIndex((prev) => (prev + 1) % allMedia.length);
    setImageError(false);
  };

  const goToPrevious = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentMediaIndex((prev) => (prev - 1 + allMedia.length) % allMedia.length);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  const getProxiedUrl = (url: string) => {
    return CompetitorService.getProxiedImageUrl(url);
  };

  return (
    <div className="relative group">
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
          {currentMedia && (
            <>
              {currentMedia.type === 'video' ? (
                <div className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer group/video">
                  <video
                    src={getProxiedUrl(currentMedia.url)}
                    className="object-contain w-full h-full"
                    controls
                    playsInline
                    onError={handleImageError}
                    preload="metadata"
                  />
                </div>
              ) : (
                <Image
                  src={imageError ? CompetitorService.getPlaceholderImage() : getProxiedUrl(currentMedia.url)}
                  alt={CompetitorService.truncateCaption(post.caption || '', 50)}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 25vw"
                  className="object-cover"
                  onError={handleImageError}
                />
              )}
            </>
          )}

          {!currentMedia && (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <span className="text-sm">No media available</span>
            </div>
          )}

          {hasMultipleMedia && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 text-white z-20"
                    onClick={goToPrevious}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Previous</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 text-white z-20"
                    onClick={goToNext}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Next</p>
                </TooltipContent>
              </Tooltip>

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {allMedia.map((_, index) => (
                  <div
                    key={index}
                    className={`w-1.5 h-1.5 rounded-full ${
                      index === currentMediaIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </TooltipProvider>
          )}

          <div className="absolute top-2 right-2 flex gap-1">
            {hasMultipleMedia && (
              <Badge variant="secondary" className="text-xs">
                {currentMediaIndex + 1}/{allMedia.length}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {CompetitorService.getPostTypeIcon(post.type, post.product_type)}
            </Badge>
          </div>

          {post.is_pinned && (
            <div className="absolute top-2 left-2">
              <Badge variant="default" className="text-xs">
                📌 Pinned
              </Badge>
            </div>
          )}

          {post.caption && (
            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white p-4 pointer-events-none">
              <p className="text-sm line-clamp-6 text-center">
                {post.caption}
              </p>
            </div>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={CompetitorService.getPostOpenUrl(post.short_code, post.product_type)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-white/20"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open in Instagram</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

      <div className="p-3">
        <TooltipProvider>
          <div className="flex items-center justify-around text-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  <Heart className="h-4 w-4 text-red-500" />
                  <span className="font-medium">{CompetitorService.formatNumber(post.likes_count)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Likes</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{CompetitorService.formatNumber(post.comments_count)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Comments</p>
              </TooltipContent>
            </Tooltip>
            
            {post.views && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-default">
                    <Eye className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">{CompetitorService.formatNumber(post.views)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Views</p>
                </TooltipContent>
              </Tooltip>
            )}

            {engagementRate !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-default">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{CompetitorService.formatEngagementRate(engagementRate)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Engagement Rate</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
};
