import type {
  PaidMetricsComparison,
  PaidMetricsTrendPoint,
} from '@/components/paid-media/dashboard/PerformanceDetails';
import type { PaidMetricsResponse } from '@/lib/schemas/paidMetrics';

export type PaidMediaPlatform = 'meta' | 'google-ads' | 'dv360' | 'linkedin';

export type CampaignPerformanceMetricKey = keyof PaidMetricsResponse['metrics'];

export type CampaignPerformanceMetrics = PaidMetricsResponse['metrics'];

export type CampaignPerformanceRow = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  metrics?: CampaignPerformanceMetrics;
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
};
