import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getChangelogRetentionStartDate, sortChangelogDesc } from './changelog';
import { type ChangelogEntry, changelogEntrySchema } from './schema';

// The popover surfaces only the active five-day window; the whats_new table
// retains full history for auditability, so apply both bounds to this read.
const WHATS_NEW_LIMIT = 8;

/**
 * Read the product changelog from public.whats_new for the header popover.
 * Memoized per request. Validates each row at the boundary and drops any that
 * fail (fail-open) so a single malformed row can never blank the header, and
 * returns [] on any read error rather than breaking the dashboard layout.
 */
export const getServerChangelog = cache(async (): Promise<ChangelogEntry[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const retentionStartDate = getChangelogRetentionStartDate();
    const { data, error } = await supabase
      .from('whats_new')
      .select('id, date, title, body, tag, createdAt:created_at')
      .gte('date', retentionStartDate)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(WHATS_NEW_LIMIT);

    if (error) {
      console.error('[whats-new] read failed', error);
      return [];
    }

    const valid: ChangelogEntry[] = [];
    for (const row of data ?? []) {
      const parsed = changelogEntrySchema.safeParse(row);
      if (parsed.success) {
        valid.push(parsed.data);
      } else {
        console.error('[whats-new] dropped malformed row', parsed.error.issues);
      }
    }

    return sortChangelogDesc(valid);
  } catch (err) {
    console.error('[whats-new] read threw', err);
    return [];
  }
});
