import { NextResponse } from 'next/server';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { getServerUser } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const brandProfileId = searchParams.get('brand');

  if (!brandProfileId) {
    return NextResponse.json({ error: 'brand query param is required' }, { status: 400 });
  }

  try {
    const summary = await fetchBrandIntegrationSummary(brandProfileId);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[brand-integrations] failed to load summary', error);
    return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 });
  }
}
