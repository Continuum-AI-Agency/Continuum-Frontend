'use client';

/**
 * The ONLY place a paid-scaffold Supabase call lives.
 *
 * Reading `brand_profiles.paid_scaffold_nodes` straight from the browser is
 * deliberate. The scaffold card renders inside a client-only streaming transcript
 * with no server boundary available; RLS already grants exactly this read to brand
 * members (`using (has_brand_access(brand_id))`) and grants no write at all, so a
 * route handler could only re-implement a check the database already makes — which
 * root AGENTS.md §5 names as a thin auth-forwarding proxy. The house rule against
 * client DB access is honoured the way the same doc mandates: one wrapper module,
 * never a query inside a component.
 *
 * The division of labour that matters: `paid.scaffold_progress` frames are the PUSH
 * channel (they say when something moved); these rows are the TRUTH channel (they say
 * what is actually there). Statuses and Meta ids mutate under the UI during every
 * gate, which is why the tree is never carried on the wire.
 */

import type { PaidScaffoldNodeRow, ScaffoldNodeStatus } from '@/lib/paid-media/scaffoldTree';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const NODE_COLUMNS =
  'id,parent_id,level,ordinal,path_key,name,product_key,angle_key,concept_key,payload,status,meta_object_id,meta_creative_id,error_message,attempt';

const NODE_STATUSES: readonly ScaffoldNodeStatus[] = [
  'pending',
  'creating',
  'created',
  'activating',
  'active',
  'failed_retryable',
  'failed_terminal',
  'indeterminate',
];

export type PaidScaffoldTreeRead = {
  versionId: string;
  rows: PaidScaffoldNodeRow[];
};

const asStatus = (value: unknown): ScaffoldNodeStatus =>
  NODE_STATUSES.includes(value as ScaffoldNodeStatus)
    ? (value as ScaffoldNodeStatus)
    : // A status this client does not know is safer read as pending than as created:
      // it understates progress rather than claiming something exists on Meta.
      'pending';

const asLevel = (value: unknown): PaidScaffoldNodeRow['level'] =>
  value === 'campaign' || value === 'adset' || value === 'ad' ? value : 'ad';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toNodeRow = (raw: Record<string, unknown>): PaidScaffoldNodeRow => ({
  id: String(raw.id ?? ''),
  parentId: asNullableString(raw.parent_id),
  level: asLevel(raw.level),
  ordinal: typeof raw.ordinal === 'number' ? raw.ordinal : 0,
  pathKey: String(raw.path_key ?? ''),
  name: String(raw.name ?? ''),
  productKey: asNullableString(raw.product_key),
  angleKey: asNullableString(raw.angle_key),
  conceptKey: asNullableString(raw.concept_key),
  payload: asRecord(raw.payload),
  status: asStatus(raw.status),
  metaObjectId: asNullableString(raw.meta_object_id),
  metaCreativeId: asNullableString(raw.meta_creative_id),
  errorMessage: asNullableString(raw.error_message),
  attempt: typeof raw.attempt === 'number' ? raw.attempt : 0,
});

/**
 * One query. `scaffoldVersionId` is what the wire frame carries as `scaffoldId`, and
 * it is the column the nodes are stored under — so there is no hop through
 * `paid_scaffolds.current_version_id`.
 *
 * Ordered by `path_key`, which is lexicographically parent-before-child by
 * construction ('c0' < 'c0/a1' < 'c0/a1/ad2'), so the tree builder never sorts.
 */
export async function fetchPaidScaffoldTreeRows(params: {
  scaffoldVersionId: string;
}): Promise<PaidScaffoldTreeRead> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('paid_scaffold_nodes')
    .select(NODE_COLUMNS)
    .eq('version_id', params.scaffoldVersionId)
    .order('path_key', { ascending: true });

  if (error) {
    throw new Error(`Could not load the campaign scaffold: ${error.message}`);
  }

  return {
    versionId: params.scaffoldVersionId,
    rows: (data ?? []).map((entry) => toNodeRow(entry as unknown as Record<string, unknown>)),
  };
}
