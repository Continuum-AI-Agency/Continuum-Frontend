// Saved dashboards — a Jaina report's blocks, kept under a name. A dashboard is a saved
// set of typed blocks plus the scope and window they were produced for; the renderer is
// the report renderer, and "refresh" is asking Jaina the source question again. No
// builder grammar: the creation flow stays conversational.

import { z } from 'zod';
import { dashboardSpecSchema } from './jaina-dashboard-spec';
import { checkpointBlockV2LenientSchema } from './jaina-report';

export const jainaDashboardSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  ad_account_id: z.string().nullable().default(null),
  name: z.string().min(1).max(120),
  source_title: z.string().nullable().default(null),
  source_prompt: z.string().nullable().default(null),
  scope: z.string().default('account'),
  window_label: z.string().nullable().default(null),
  /** Stored verbatim; the Frontend re-parses each block leniently on read. */
  blocks: z.array(checkpointBlockV2LenientSchema),
  /** What each block would need to be re-run for another window (see jaina-dashboard-spec).
   *  Null on rows saved before the spec existed, and on every row until the `spec` column
   *  is applied (migration 20260923205040). */
  spec: dashboardSpecSchema.nullable().default(null),
  created_by: z.string().uuid().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
});
export type JainaDashboard = z.infer<typeof jainaDashboardSchema>;

export const jainaDashboardInsertSchema = jainaDashboardSchema
  .pick({
    brand_id: true,
    ad_account_id: true,
    name: true,
    source_title: true,
    source_prompt: true,
    scope: true,
    window_label: true,
    blocks: true,
    spec: true,
  })
  .extend({ name: z.string().trim().min(1).max(120) });
export type JainaDashboardInsert = z.infer<typeof jainaDashboardInsertSchema>;
