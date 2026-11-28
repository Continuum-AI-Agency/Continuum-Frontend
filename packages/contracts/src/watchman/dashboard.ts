import { z } from 'zod';
import {
  watchmanConversationEventSchema,
  watchmanLifecycleSchema,
  watchmanReadinessSchema,
  watchmanTeammateProfileSchema,
  watchmanUiBlockSchema,
  watchmanUiMessageSchema,
  watchmanWorkSchema,
} from './teammates';

export const WATCHMAN_DASHBOARD_ROUTE = '/api/watchman/dashboard';
export const WATCHMAN_CONVERSATION_ROUTE = '/api/watchman/conversation';

export const watchmanDashboardTeammateSchema = z
  .object({
    profile: watchmanTeammateProfileSchema,
    lifecycle: watchmanLifecycleSchema,
    readiness: watchmanReadinessSchema.nullable(),
    budget: z
      .object({ month_spend_usd: z.number(), budget_usd: z.number(), state: z.string() })
      .nullable(),
    active_work_count: z.number().int().nonnegative(),
    waiting_count: z.number().int().nonnegative(),
    last_activity_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type WatchmanDashboardTeammate = z.infer<typeof watchmanDashboardTeammateSchema>;

export const watchmanAttentionItemSchema = z
  .object({
    id: z.string().min(1).max(240),
    watchman_id: z.string().uuid(),
    type: z.enum(['approval', 'question', 'connection', 'failure', 'report']),
    title: z.string().min(1).max(300),
    detail: z.string().max(4_000),
    created_at: z.iso.datetime({ offset: true }),
    conversation_id: z.string().min(1).max(240).nullable(),
    href: z.string().startsWith('/goals/').max(700).optional(),
    block: watchmanUiBlockSchema.optional(),
  })
  .strict();
export type WatchmanAttentionItem = z.infer<typeof watchmanAttentionItemSchema>;

export const watchmanDashboardSchema = z
  .object({
    brand_id: z.string().uuid(),
    generated_at: z.iso.datetime({ offset: true }),
    can_manage: z.boolean(),
    partial: z.boolean(),
    issues: z
      .array(
        z
          .object({ source: z.string().min(1).max(100), message: z.string().min(1).max(1_000) })
          .strict(),
      )
      .max(20),
    teammates: z.array(watchmanDashboardTeammateSchema),
    work: z.array(watchmanWorkSchema),
    needs_you: z.array(watchmanAttentionItemSchema),
  })
  .strict()
  .superRefine((dashboard, context) => {
    const ids = new Set(dashboard.teammates.map((teammate) => teammate.profile.id));
    if (ids.size !== dashboard.teammates.length)
      context.addIssue({
        code: 'custom',
        path: ['teammates'],
        message: 'Dashboard teammates must be unique.',
      });
    if (dashboard.teammates.some((teammate) => teammate.profile.brand_id !== dashboard.brand_id))
      context.addIssue({
        code: 'custom',
        path: ['teammates'],
        message: 'Dashboard teammates must belong to this brand.',
      });
    if (
      dashboard.work.some(
        (work) => work.brand_id !== dashboard.brand_id || !ids.has(work.owner_watchman_id),
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['work'],
        message: 'Work must belong to this brand and a listed teammate.',
      });
    if (dashboard.needs_you.some((item) => !ids.has(item.watchman_id)))
      context.addIssue({
        code: 'custom',
        path: ['needs_you'],
        message: 'Attention must name a listed teammate.',
      });
  });

export type WatchmanDashboard = z.infer<typeof watchmanDashboardSchema>;

export const watchmanConversationViewSchema = z
  .object({
    conversation_id: z.string().min(1).max(240),
    watchman_id: z.string().uuid(),
    version: z.number().int().nonnegative(),
    events: z.array(watchmanConversationEventSchema),
    messages: z.array(watchmanUiMessageSchema),
  })
  .strict();
export type WatchmanConversationView = z.infer<typeof watchmanConversationViewSchema>;
