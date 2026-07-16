import {
  type BillingSummary,
  type EffectiveEntitlements,
  billingSummarySchema,
  effectiveEntitlementsSchema,
} from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function fetchBillingApi<T>(params: {
  brandId: string;
  resource: 'summary' | 'entitlements';
  parse(value: unknown): { success: true; data: T } | { success: false };
}): Promise<T | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !apiKey) return null;

  const response = await fetch(
    `${url.replace(/\/$/, '')}/functions/v1/billing-api/brands/${params.brandId}/${params.resource}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
      cache: 'no-store',
    },
  );
  if (!response.ok) return null;

  const parsed = params.parse(await response.json());
  return parsed.success ? parsed.data : null;
}

export function fetchBillingSummary(brandId: string): Promise<BillingSummary | null> {
  return fetchBillingApi({ brandId, resource: 'summary', parse: billingSummarySchema.safeParse });
}

export function fetchEffectiveEntitlements(
  brandId: string,
): Promise<EffectiveEntitlements | null> {
  return fetchBillingApi({
    brandId,
    resource: 'entitlements',
    parse: effectiveEntitlementsSchema.safeParse,
  });
}
