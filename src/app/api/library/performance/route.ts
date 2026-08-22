import {
  assetAdAttributionMapSchema,
  assetPerformanceSchema,
  assetUsageSchema,
  paidMetricWindowSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  window: paidMetricWindowSchema.default('d30'),
});

// media_get_asset_performance / media_get_asset_usage are SECURITY DEFINER, assert
// brand membership themselves, and grant EXECUTE to `authenticated` — so they run on
// the USER-scoped client and never need a service-role bypass. They post-date the
// generated Database type, so the rpc() surface is cast once, here, at the boundary.
type JsonbRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const publicRpc = (client: SupabaseClient): JsonbRpcClient => client as unknown as JsonbRpcClient;

// GET /api/library/performance?brandId&assetId&window — the Creative DNA read:
// where this creative ran, what it earned, and which version ran where.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
    window: url.searchParams.get('window') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'brandId and assetId must be uuids; window must be d7, d14 or d30' },
      { status: 400 },
    );
  }
  const { brandId, assetId, window } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rpc = publicRpc(supabase);
  const [performanceResult, usageResult, attributionResult] = await Promise.all([
    rpc.rpc('media_get_asset_performance', {
      p_brand_id: brandId,
      p_asset_id: assetId,
      p_window: window,
    }),
    rpc.rpc('media_get_asset_usage', { p_brand_id: brandId, p_asset_id: assetId }),
    rpc.rpc('paid_media_get_asset_ad_attribution', {
      p_brand_id: brandId,
      p_asset_id: assetId,
      p_window: window,
      p_cutoff: new Date().toISOString().slice(0, 10),
    }),
  ]);

  const rpcError = performanceResult.error ?? usageResult.error ?? attributionResult.error;
  if (rpcError) {
    console.error('[library/performance] rpc failed', { assetId, window, error: rpcError.message });
    return NextResponse.json({ error: 'Performance query failed' }, { status: 500 });
  }

  const performance = assetPerformanceSchema.safeParse(performanceResult.data);
  const usage = assetUsageSchema.safeParse(usageResult.data);
  const attribution = assetAdAttributionMapSchema.safeParse(attributionResult.data ?? {});
  if (!performance.success || !usage.success || !attribution.success) {
    // A shape we cannot vouch for is worse than no panel: refuse rather than
    // hand the viewer numbers whose meaning we could not verify.
    console.error('[library/performance] unexpected rpc shape', {
      assetId,
      window,
      performanceError: performance.success ? null : performance.error.message,
      usageError: usage.success ? null : usage.error.message,
      attributionError: attribution.success ? null : attribution.error.message,
    });
    return NextResponse.json({ error: 'Performance query failed' }, { status: 500 });
  }

  const merged = {
    ...performance.data,
    deployments: performance.data.deployments.map((deployment) => {
      const adId = deployment.ad?.adId;
      const observed = adId ? attribution.data[adId] : null;
      if (!deployment.ad || !observed) return deployment;
      return {
        ...deployment,
        ad: {
          ...deployment.ad,
          metrics: { ...deployment.ad.metrics, ...observed.metrics },
          virality: observed.virality,
          outcome: observed.outcome,
          attributionSetting: observed.attributionSetting,
        },
      };
    }),
  };

  return NextResponse.json({ performance: merged, usage: usage.data });
}
