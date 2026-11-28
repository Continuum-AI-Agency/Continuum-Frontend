import { z } from 'zod';
import { goalWorkProductSchema } from '../goals/campaign-artifacts';
import { publishPlatformSchema } from '../organic/publishing';

const id = z.string().trim().min(1).max(180);
const timestamp = z.iso.datetime({ offset: true });
const base = z.object({ request_id: id });
const content = base.extend({ capability: z.literal('content.draft') });
const optimize = base.extend({
  capability: z.literal('performance.optimize'),
  max_usd: z.literal(0),
});
const pause = optimize.extend({
  account_id: id,
  entity_type: z.enum(['campaign', 'adset']),
  entity_id: id,
  parent_id: id.optional(),
  expected_status: z.string().min(1).max(80),
});

/** Closed orchestration steps over existing tools; none grant publishing or spend authority. */
export const watchmanCapabilityInputSchema = z.union([
  content.extend({ step: z.literal('prepare'), platform: publishPlatformSchema }).strict(),
  content
    .extend({
      step: z.literal('create'),
      platform: publishPlatformSchema,
      prompt: z.string().trim().min(1).max(8_000),
      caption: z.string().trim().min(1).max(20_000),
      account_id: id,
      scheduled_at: timestamp,
      format: z.string().min(1).max(100).optional(),
    })
    .strict(),
  content.extend({ step: z.literal('inspect'), draft_id: id }).strict(),
  content
    .extend({
      step: z.literal('realize'),
      draft_id: id,
      expected_updated_at: timestamp,
      max_usd: z.number().positive().max(100),
      preview_revision: id.optional(),
    })
    .strict(),
  content
    .extend({ step: z.literal('propose_publish'), draft_id: id, expected_updated_at: timestamp })
    .strict(),
  base
    .extend({
      capability: z.literal('content.report'),
      account_id: z.string().uuid(),
      date_window: z.enum(['last_7d', 'last_14d', 'last_30d', 'last_90d', 'last_month']),
      expected_period: z.object({ start: timestamp, end: timestamp }).strict().optional(),
    })
    .strict(),
  base
    .extend({
      capability: z.literal('performance.report'),
      portfolio_id: z.string().uuid(),
      account_id: id,
      since: z.iso.date(),
      until: z.iso.date(),
    })
    .strict(),
  base
    .extend({
      capability: z.literal('performance.optimize'),
      action: z.literal('preview_observe'),
      portfolio_id: z.string().uuid(),
    })
    .strict(),
  optimize
    .extend({
      action: z.literal('apply_observe'),
      portfolio_id: z.string().uuid(),
      expected_hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  pause.extend({ action: z.literal('preview_pause') }).strict(),
  pause
    .extend({ action: z.literal('apply_pause'), confirm_token: z.string().min(1).max(4_096) })
    .strict(),
  base
    .extend({
      capability: z.literal('gtm.research'),
      query: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  base.extend({ capability: z.literal('gtm.plan'), work_product: goalWorkProductSchema }).strict(),
  base.extend({ capability: z.literal('lead.coordinate'), step: z.literal('prepare') }).strict(),
  base
    .extend({
      capability: z.literal('lead.coordinate'),
      step: z.literal('assign'),
      assignments: z
        .array(
          z
            .object({
              workstream_id: id,
              target_watchman_id: z.string().uuid(),
              capability: id,
              depends_on: z.array(id).max(4),
              due_at: timestamp,
            })
            .strict(),
        )
        .min(1)
        .max(4),
    })
    .strict(),
  base
    .extend({
      capability: z.literal('lead.coordinate'),
      step: z.literal('join'),
      workstream_ids: z.array(id).min(1).max(4),
      go_no_go_decision_id: id.optional(),
      next_check_at: timestamp.optional(),
    })
    .strict(),
]);
export type WatchmanCapabilityInput = z.infer<typeof watchmanCapabilityInputSchema>;
