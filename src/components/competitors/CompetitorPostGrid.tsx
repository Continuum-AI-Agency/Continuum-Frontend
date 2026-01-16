"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Badge } from "@radix-ui/themes";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Hash,
  Heart,
  MapPin,
  MessageCircle,
  Play,
  TrendingUp,
} from "lucide-react";

import { CompetitorService } from "@/services/competitorService";
import type { CompetitorPost } from "@/types/competitor-types";

type ViewMedia = { displayUrl: string; type: "Image" | "Video"; videoUrl?: string };

type ViewPost = {
  id: string;
  timestamp: string;
  caption?: string;
  hashtags: string[];
  type?: string;
  productType?: string;
  likes: number;
  comments: number;
  views?: number;
  engagementRate?: number;
  media: ViewMedia[];
  openUrl: string;
  locationName?: string;
  isPinned?: boolean;
};

function normalizePost(post: CompetitorPost): ViewPost {
  const isVideo = post.productType === "reel" || post.type?.toLowerCase() === "video";
  const mediaSources = (post.carouselItems ?? post.mediaUrls ?? []).map((url) => ({
    displayUrl: CompetitorService.getProxiedImageUrl(url),
    type: isVideo ? ("Video" as const) : ("Image" as const),
    videoUrl: isVideo ? url : undefined,
  }));

  return {
    id: post.id,
    timestamp: post.timestamp,
    caption: post.caption,
    hashtags: post.hashtags ?? [],
    type: post.type,
    productType: post.productType,
    likes: post.likesCount,
    comments: post.commentsCount,
    views: post.views,
    engagementRate: post.views ? CompetitorService.calculateVideoEngagementRate(post.likesCount, post.commentsCount, post.views) : undefined,
    media: mediaSources.length > 0 ? mediaSources : [{ displayUrl: CompetitorService.getPlaceholderImage(), type: "Image" }],
    openUrl: CompetitorService.getPostOpenUrl(post.shortCode, post.productType),
    locationName: undefined,
    isPinned: post.isPinned,
  };
}

type CompetitorPostGridProps = {
  posts: CompetitorPost[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  isLoading: boolean;
};

type PostCardProps = {
  post: ViewPost;
};

const PostCard = ({ post }: PostCardProps) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentMedia = post.media[currentMediaIndex];
  const isVideo = currentMedia?.type === "Video";
  const hasMultipleMedia = post.media.length > 1;

  const displayUrl = imageError
    ? CompetitorService.getPlaceholderImage()
    : CompetitorService.isValidImageUrl(currentMedia?.displayUrl || "")
      ? currentMedia.displayUrl
      : CompetitorService.getPlaceholderImage();

  const nextMedia = () => {
    if (hasMultipleMedia) {
      setCurrentMediaIndex((prev) => (prev + 1) % post.media.length);
      setImageError(false);
    }
  };

  const prevMedia = () => {
    if (hasMultipleMedia) {
      setCurrentMediaIndex((prev) => (prev - 1 + post.media.length) % post.media.length);
      setImageError(false);
    }
  };

  const handleVideoEnter = () => {
    setIsVideoPlaying(true);
    void videoRef.current?.play();
  };

  const handleVideoLeave = () => {
    setIsVideoPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5 hover:shadow-lg transition-shadow duration-200">
      <div className="relative aspect-square bg-muted">
        {isVideo && currentMedia?.videoUrl && !imageError ? (
          <div
            className="relative w-full h-full"
            onMouseEnter={handleVideoEnter}
            onMouseLeave={handleVideoLeave}
          >
            <video
              ref={videoRef}
              src={currentMedia.videoUrl}
              poster={currentMedia.displayUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
              onError={() => setImageError(true)}
            />
            {!isVideoPlaying && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="bg-white/90 rounded-full p-3">
                  <Play className="h-6 w-6 text-black" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <Image
            src={displayUrl}
            alt={post.caption ?? "Instagram post"}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 25vw"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}

        {hasMultipleMedia && (
          <>
            <button
              onClick={prevMedia}
              className="absolute left-2 top-1/2 -translate-y-1/2 transform bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextMedia}
              className="absolute right-2 top-1/2 -translate-y-1/2 transform bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 transform flex space-x-1">
              {post.media.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${index === currentMediaIndex ? "bg-white" : "bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}

        <div className="absolute top-2 left-2">
          <Badge variant="soft" color="indigo" className="text-xs">
            {CompetitorService.getPostTypeIcon(post.type ?? "", post.productType ?? "")}
            {post.productType === "reel" ? "Reel" : post.type ?? ""}
          </Badge>
        </div>

        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="sm"
            className="bg-white/90 hover:bg-white text-black"
            onClick={() => window.open(post.openUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-1">
            <Heart className="h-4 w-4 text-red-500" />
            <span className="font-medium">{CompetitorService.formatNumber(post.likes)}</span>
          </div>
          <div className="flex items-center space-x-1">
            <MessageCircle className="h-4 w-4 text-green-500" />
            <span className="font-medium">{CompetitorService.formatNumber(post.comments)}</span>
          </div>
          {post.views ? (
            <div className="flex items-center space-x-1">
              <Eye className="h-4 w-4 text-orange-500" />
              <span className="font-medium">{CompetitorService.formatNumber(post.views)}</span>
            </div>
          ) : null}
          {post.engagementRate !== undefined ? (
            <div className="flex items-center space-x-1">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="font-medium">{CompetitorService.formatEngagementRate(post.engagementRate)}</span>
            </div>
          ) : null}
        </div>

        {post.caption ? (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {CompetitorService.truncateCaption(post.caption)}
          </p>
        ) : null}

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

        {post.locationName ? (
          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{post.locationName}</span>
          </div>
        ) : null}

        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{new Date(post.timestamp).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

const PostSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
    <div className="aspect-square animate-pulse bg-slate-800" />
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="h-4 w-16 animate-pulse bg-slate-800 rounded" />
        <div className="h-4 w-16 animate-pulse bg-slate-800 rounded" />
      </div>
      <div className="h-16 w-full animate-pulse bg-slate-800 rounded" />
      <div className="flex space-x-1">
        <div className="h-6 w-12 animate-pulse bg-slate-800 rounded" />
        <div className="h-6 w-12 animate-pulse bg-slate-800 rounded" />
        <div className="h-6 w-12 animate-pulse bg-slate-800 rounded" />
      </div>
    </div>
  </div>
);

export function CompetitorPostGrid({ posts, pagination, onPageChange, isLoading }: CompetitorPostGridProps) {
  const normalizedPosts: ViewPost[] = posts.map(normalizePost);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: pagination.pageSize }).map((_, idx) => <PostSkeleton key={idx} />)
          : normalizedPosts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1 || isLoading}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages || isLoading}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
