// The paid-scaffold build as the transcript renders it.
//
// A scaffold run is a long tail of per-node progress frames against one
// `paid_scaffold_versions` row. These types describe that accumulated view; the rows themselves
// live in Postgres. Shared by `JainaChatMessage`, `PaidScaffoldCard` and `scaffoldTree.ts`.

import type { PaidScaffoldReceiptPayload } from '@continuum/contracts';

export type JainaScaffoldNodeProgress = {
  step: string;
  status: 'started' | 'succeeded' | 'failed' | 'skipped';
  entityId: string | null;
  message: string | null;
  index?: number;
  total?: number;
};

export type JainaScaffoldState = {
  /** `paid_scaffold_versions.id` — the key the node rows are filtered on. */
  scaffoldId: string;
  parentScaffoldId?: string;
  brandId?: string;
  adAccountId?: string | null;
  approvalId?: string | null;
  /** Ids + counts + a campaign skeleton. The rows come from Postgres, not from here. */
  plan: unknown;
  summary?: { campaigns?: number; adSets?: number; ads?: number };
  /**
   * Latest progress per node, keyed on `pathKey`. A MAP AND NOT AN ARRAY: a 50-ad-set
   * build emits ~300 progress frames, and the transcript re-projects every part on every
   * streaming frame. A keyed merge makes that projection idempotent by construction; an
   * append would grow without bound on every replay.
   */
  progressByNode: Record<string, JainaScaffoldNodeProgress>;
  lastProgress: { index?: number; total?: number } | null;
  receipt: PaidScaffoldReceiptPayload | null;
};
