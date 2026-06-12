// Maps a metric descriptor icon key to its lucide glyph. Kept apart from the
// pure cardMetricSet module so that module stays React-free and unit-testable.

import {
  Bookmark,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { MetricIconKey } from "./cardMetricSet";

export const METRIC_ICONS: Record<MetricIconKey, LucideIcon> = {
  views: Eye,
  reach: Users,
  engagement: TrendingUp,
  hook: Zap,
  watch: Clock,
  totalWatch: Clock,
  likes: Heart,
  comments: MessageCircle,
  shares: Share2,
  saved: Bookmark,
};
