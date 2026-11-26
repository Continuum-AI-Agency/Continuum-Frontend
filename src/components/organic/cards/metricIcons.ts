// Maps a metric descriptor icon key to its glyph. Kept apart from the
// pure cardMetricSet module so that module stays React-free and unit-testable.

import {
  Bookmark,
  Clock,
  Eye,
  Heart,
  type IconComponent,
  MessageCircle,
  Share2,
  TrendingUp,
  Users,
  Zap,
} from '@/components/icons';

import type { MetricIconKey } from './cardMetricSet';

export const METRIC_ICONS: Record<MetricIconKey, IconComponent> = {
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
