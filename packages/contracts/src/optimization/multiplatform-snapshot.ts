// The neutral entity snapshot every platform's ingest produces: one campaign, group or ad,
// its budget, bidding, provider status and three trailing windows. Standalone for now —
// a later wave maps it onto the engine's AdSetSnapshot.
// Design: docs/optimizer-multiplatform/google-lectura.html §D.2, google-acciones.html §6,
// tiktok.html §3.3.

import { z } from 'zod';
import {
  BudgetRefSchema,
  EntityAutomationSchema,
  EntityLevelSchema,
  isAutomationOfPlatform,
  isNativeLevelOf,
  NativeLevelSchema,
  PlatformIdSchema,
} from '../paid/platform';
import { WindowMetricsSchema } from './engine-contracts';

const eventCount = z.number().nonnegative();

export const ConversionActionCountSchema = z.object({
  count: eventCount,
  value: z.number().nonnegative().optional(),
  /** Google conversion_action.category / Meta action_type family, verbatim. */
  category: z.string().optional(),
});

/** Provider-reported delivery: impression share on Google Search (fractions 0..1, as the
 *  API reports them), reach and frequency on Meta and TikTok. Absent means not reported. */
export const SnapshotDeliverySchema = z.object({
  impressionShare: z.number().min(0).max(1).optional(),
  budgetLostImpressionShare: z.number().min(0).max(1).optional(),
  rankLostImpressionShare: z.number().min(0).max(1).optional(),
  reach: z.number().int().nonnegative().optional(),
  frequency: z.number().nonnegative().optional(),
});

/** The engine's WindowMetrics with event counts relaxed to non-negative numbers — Google's
 *  data-driven attribution reports fractional conversions (Vivo 47: 144.5 in 30 days), and
 *  rounding them here would invent or erase results. Spend is major units. */
export const MultiPlatformWindowMetricsSchema = WindowMetricsSchema.extend({
  purchases: eventCount,
  addToCarts: eventCount,
  leads: eventCount.optional(),
  appInstalls: eventCount.optional(),
  signups: eventCount.optional(),
  landingPageViews: eventCount.optional(),
  conversations: eventCount.optional(),
  /** Undefined when the platform reports no value (Meta today) — never 0. */
  conversionsValue: z.number().nonnegative().optional(),
  /** Keyed by conversion_action id (Google) or action_type (Meta) or event name (TikTok). */
  conversionsByAction: z.record(z.string(), ConversionActionCountSchema).optional(),
  delivery: SnapshotDeliverySchema.optional(),
});
export type MultiPlatformWindowMetrics = z.infer<typeof MultiPlatformWindowMetricsSchema>;

export const SnapshotBiddingSchema = z.object({
  /** The platform's strategy name, verbatim (MAXIMIZE_CONVERSIONS, COST_CAP, BID_TYPE_NO_BID…). */
  strategyType: z.string().min(1),
  targetCpaMicros: z.number().int().positive().optional(),
  targetRoas: z.number().positive().optional(),
  /** Google bidding_strategy_system_status (LEARNING_NEW, ENABLED…), verbatim. */
  systemStatus: z.string().optional(),
});

export const MultiPlatformSnapshotSchema = z
  .object({
    platform: PlatformIdSchema,
    level: EntityLevelSchema,
    native_level: NativeLevelSchema,
    id: z.string().min(1),
    accountId: z.string().min(1),
    name: z.string().optional(),
    campaignId: z.string().optional(),
    automation: EntityAutomationSchema,
    budget: BudgetRefSchema,
    bidding: SnapshotBiddingSchema.optional(),
    /** Google primary_status / TikTok primary_status / Meta effective_status, verbatim. */
    primaryStatus: z.string().optional(),
    /** Google primary_status_reasons / TikTok secondary_status / Meta issues. */
    primaryStatusReasons: z.array(z.string()).optional(),
    windows: z.object({
      d3: MultiPlatformWindowMetricsSchema,
      d7: MultiPlatformWindowMetricsSchema,
      d14: MultiPlatformWindowMetricsSchema,
    }),
  })
  .superRefine((snapshot, ctx) => {
    if (!isNativeLevelOf(snapshot.platform, snapshot.level, snapshot.native_level)) {
      ctx.addIssue({
        code: 'custom',
        message: 'native_level is not a name this platform uses at this level',
        path: ['native_level'],
      });
    }
    if (!isAutomationOfPlatform(snapshot.platform, snapshot.automation)) {
      ctx.addIssue({
        code: 'custom',
        message: 'automation does not exist on this platform',
        path: ['automation'],
      });
    }
    if (snapshot.budget.ownerRef.platform !== snapshot.platform) {
      ctx.addIssue({
        code: 'custom',
        message: 'the budget must be owned on the same platform',
        path: ['budget', 'ownerRef'],
      });
    }
  });
export type MultiPlatformSnapshot = z.infer<typeof MultiPlatformSnapshotSchema>;
