import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  type CampaignIndexRecord,
  campaignIndexUpdateSchema,
} from '@/lib/paid-media/campaign-indexes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const CAMPAIGN_INDEX_TABLE = 'paid_media_campaign_indexes' as never;

const paramsSchema = z.object({
  indexId: z.string().uuid(),
});

type CampaignIndexRow = {
  id: string;
  brand_id: string;
  meta_account_id: string;
  name: string;
  campaign_ids: string[];
  created_at: string;
  updated_at: string;
};

type CampaignIndexUpdatePayload = Partial<Pick<CampaignIndexRow, 'name' | 'campaign_ids'>>;

function normalizeCampaignIndexRow(input: unknown): CampaignIndexRecord | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;

  if (
    typeof row.id !== 'string' ||
    typeof row.brand_id !== 'string' ||
    typeof row.meta_account_id !== 'string' ||
    typeof row.name !== 'string' ||
    !Array.isArray(row.campaign_ids) ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    return null;
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    metaAccountId: row.meta_account_id,
    name: row.name,
    campaignIds: row.campaign_ids.filter((value): value is string => typeof value === 'string'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function PUT(request: NextRequest, context: { params: Promise<{ indexId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid index id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = campaignIndexUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates: CampaignIndexUpdatePayload = {};
    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name.trim();
    }
    if (parsed.data.campaignIds !== undefined) {
      updates.campaign_ids = Array.from(new Set(parsed.data.campaignIds));
    }

    const { data, error } = await supabase
      .schema('brand_profiles')
      .from(CAMPAIGN_INDEX_TABLE)
      .update(updates as never)
      .eq('id', params.data.indexId)
      .select('id, brand_id, meta_account_id, name, campaign_ids, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const index = normalizeCampaignIndexRow(data as CampaignIndexRow);
    if (!index) {
      return NextResponse.json({ error: 'Invalid campaign index response' }, { status: 502 });
    }

    return NextResponse.json({ index }, { status: 200 });
  } catch (error) {
    console.error('Failed to update campaign index', error);
    return NextResponse.json({ error: 'Failed to update campaign index' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ indexId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid index id' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .schema('brand_profiles')
      .from(CAMPAIGN_INDEX_TABLE)
      .delete()
      .eq('id', params.data.indexId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete campaign index', error);
    return NextResponse.json({ error: 'Failed to delete campaign index' }, { status: 500 });
  }
}
