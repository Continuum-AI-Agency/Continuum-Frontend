// Reads and writes the objectives each brand's Home leads with (brand_profiles.home_profiles).
// A brand without the table or without a row is a normal state: the Home infers objectives
// from the account's results, so a failed read degrades to "no saved objectives", never to an error.
import 'server-only';

import {
  type HomeObjective,
  type HomeProfileRow,
  homeObjectiveListSchema,
  homeProfileRowSchema,
} from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const TABLE = 'home_profiles';

export async function loadHomeProfileRows(brandId: string): Promise<HomeProfileRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from(TABLE)
    .select('brand_id, scope, objectives, source, updated_at')
    .eq('brand_id', brandId);

  if (error) {
    console.warn('[loadHomeProfileRows] read failed; the Home infers objectives instead', {
      brandId,
      code: error.code,
    });
    return [];
  }

  const rows: HomeProfileRow[] = [];
  for (const raw of data ?? []) {
    const parsed = homeProfileRowSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

export type SaveHomeObjectivesResult = { ok: true } | { ok: false; message: string };

export async function saveHomeObjectives(input: {
  brandId: string;
  scope: string;
  objectives: HomeObjective[];
}): Promise<SaveHomeObjectivesResult> {
  const objectives = homeObjectiveListSchema.safeParse(input.objectives);
  if (!objectives.success) {
    return { ok: false, message: objectives.error.issues[0]?.message ?? 'Invalid objectives.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .schema('brand_profiles')
    .from(TABLE)
    .upsert(
      {
        brand_id: input.brandId,
        scope: input.scope,
        objectives: objectives.data,
        source: 'user',
        updated_by: auth.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,scope' },
    );

  if (error) {
    console.error('[saveHomeObjectives] upsert failed', {
      brandId: input.brandId,
      code: error.code,
    });
    return {
      ok: false,
      message:
        error.code === '42P01'
          ? 'Saving goals is not switched on for this workspace yet.'
          : 'Could not save your goals. Try again.',
    };
  }
  return { ok: true };
}

export async function resetHomeObjectives(input: {
  brandId: string;
  scope: string;
}): Promise<SaveHomeObjectivesResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('brand_profiles')
    .from(TABLE)
    .delete()
    .eq('brand_id', input.brandId)
    .eq('scope', input.scope);
  if (error) {
    console.error('[resetHomeObjectives] delete failed', {
      brandId: input.brandId,
      code: error.code,
    });
    return { ok: false, message: 'Could not reset your goals. Try again.' };
  }
  return { ok: true };
}
