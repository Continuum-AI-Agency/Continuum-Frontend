import 'server-only';

import { brandEntitlementsSchema } from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BrandAccess } from './productAccess';

// What a brand may open, read once per brand from `billing.get_brand_entitlements` as the
// signed-in user (the RPC checks brand access itself).
//
// Billing is "live" exactly when PostgREST exposes the `billing` schema. Prod does not until the
// go-live cutover and answers PGRST106; that reply — never an env flag — is the signal, so the
// app switches to product entitlements on its own the moment the schema is exposed. Any OTHER
// failure fails closed: billing is live, the brand resolves no products, and the error is logged.

type Reply = { data: unknown; error: unknown };

/** The two reads, structurally — the generated types do not carry the `billing` schema. */
export type BrandAccessClient = {
  schema(name: string): {
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<Reply>;
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): { maybeSingle(): PromiseLike<Reply> };
      };
    };
  };
};

const SCHEMA_NOT_EXPOSED = 'PGRST106';

export function describeSupabaseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const { code, message, details, hint } = error as Record<string, unknown>;
    const parts = [code, message, details, hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length > 0) return parts.join(' · ');
  }
  return JSON.stringify(error);
}

function readLegacyTier(reply: Reply | null): number {
  const tier = (reply?.data as { tier?: unknown } | null)?.tier;
  return typeof tier === 'number' ? tier : 0;
}

export async function readBrandAccess(
  brandId: string,
  client?: BrandAccessClient,
): Promise<BrandAccess> {
  const supabase = client ?? ((await createSupabaseServerClient()) as unknown as BrandAccessClient);

  const settle = (reply: PromiseLike<Reply>) =>
    Promise.resolve(reply).then(
      (value) => value,
      (error: unknown): Reply => ({ data: null, error }),
    );

  const [entitlementsReply, tierReply] = await Promise.all([
    settle(supabase.schema('billing').rpc('get_brand_entitlements', { p_brand_id: brandId })),
    // billing-cutover: read in parallel so prod pays no extra round trip before go-live.
    settle(
      supabase
        .schema('brand_profiles')
        .from('brand_profiles')
        .select('tier')
        .eq('id', brandId)
        .maybeSingle(),
    ),
  ]);
  const legacyTier = readLegacyTier(tierReply);

  const rpcError = entitlementsReply.error as { code?: unknown } | null;
  if (rpcError?.code === SCHEMA_NOT_EXPOSED) {
    return { billingLive: false, products: [], entitlements: null, legacyTier };
  }
  if (rpcError) {
    console.error(
      `[billing] get_brand_entitlements failed for brand ${brandId}; treating it as no products`,
      describeSupabaseError(rpcError),
    );
    return { billingLive: true, products: [], entitlements: null, legacyTier };
  }

  const parsed = brandEntitlementsSchema.safeParse(entitlementsReply.data);
  if (!parsed.success) {
    console.error(
      `[billing] get_brand_entitlements returned an unexpected shape for brand ${brandId}; treating it as no products`,
      parsed.error.message,
    );
    return { billingLive: true, products: [], entitlements: null, legacyTier };
  }
  return {
    billingLive: true,
    products: parsed.data.products,
    entitlements: parsed.data,
    legacyTier,
  };
}
