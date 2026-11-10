import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { mapBackendJobsResponse } from '@/lib/ai-studio/backend';
import { getApiBaseUrl } from '@/lib/api/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.object({
  brandProfileId: z.string().min(1, 'brandProfileId is required'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  after: z.string().optional(),
});

function buildBackendUrl(path: string): URL {
  return new URL(path, getApiBaseUrl());
}

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = buildBackendUrl('/ai-studio/jobs');
  url.searchParams.set('brand_profile_id', parsed.data.brandProfileId);
  if (parsed.data.limit) {
    url.searchParams.set('limit', parsed.data.limit.toString());
  }
  if (parsed.data.after) {
    url.searchParams.set('after', parsed.data.after);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
  } catch (error) {
    console.error('Failed to reach AI Studio jobs service', error);
    return NextResponse.json(
      { error: 'The jobs service is unreachable.', reason: 'upstream-unreachable' },
      { status: 502 },
    );
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }

    console.warn('AI Studio jobs upstream returned error', {
      status: response.status,
      detail,
    });

    return NextResponse.json(
      { error: 'Listing jobs failed upstream.', reason: 'upstream-error', detail },
      { status: response.status },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    console.error('AI Studio jobs upstream returned non-JSON payload', error);
    return NextResponse.json(
      { error: 'The jobs service returned an unreadable response.', reason: 'invalid-json' },
      { status: 502 },
    );
  }

  try {
    const dataResponse = mapBackendJobsResponse(payload);
    return NextResponse.json(dataResponse, { status: 200 });
  } catch (err) {
    console.error('Failed to normalize AI Studio jobs payload', err);
    return NextResponse.json(
      { error: 'The jobs service returned an unexpected response.', reason: 'schema-mismatch' },
      { status: 502 },
    );
  }
}
