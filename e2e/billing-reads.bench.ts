/**
 * billing:reads:e2e:bench — does this build still read production billing after the server
 * adds a product or plan it does not know?
 *
 * Read-only against prod. Two real paths:
 *  1. `readBrandAccess` (the server gate every page goes through) for EVERY brand, against the
 *     live `billing.get_brand_entitlements`. A brand the RPC grants products to must never read
 *     as "no products" — prod FE main did that to every brand holding `listening` (2026-10-08).
 *  2. The live `billing-api` overview for the bench brand, signed in as its owner, parsed with
 *     the same `billingOverviewSchema` the Billing panel uses.
 */
import { billingOverviewSchema, PLAN_CODES, PRODUCT_CODES } from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import type { BrandAccessClient } from '@/lib/billing/brandAccess.server';
import { mintAccessTokenForEmail } from './support/auth';

// `server-only` ships inside Next, not node_modules; outside a Next build it is an empty module.
Bun.plugin({
  name: 'server-only-stub',
  setup(build) {
    build.module('server-only', () => ({ contents: '', loader: 'js' }));
  },
});
const { readBrandAccess } = await import('@/lib/billing/brandAccess.server');

const BENCH_BRAND_ID =
  process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_OWNER_EMAIL = process.env.CONTINUUM_BENCH_OWNER_EMAIL ?? 'bench@trycontinuum.ai';

// The Backend `.env` names them without the NEXT_PUBLIC_ prefix the auth helper reads.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= process.env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= process.env.SUPABASE_ANON_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url.includes('nkejqgyushulohxwtytl') || !serviceKey) {
  throw new Error(
    `[billing-reads] needs the prod NEXT_PUBLIC_SUPABASE_URL + service key, got "${url}"`,
  );
}
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}
const unknownOf = (values: unknown, known: readonly string[]) =>
  (Array.isArray(values) ? values : []).filter((value) => !known.includes(String(value)));

// 1. Every brand through the real server gate.
const { data: brands, error } = await admin
  .schema('brand_profiles')
  .from('brand_profiles')
  .select('id');
if (error || !brands) throw new Error(`[billing-reads] brand list: ${error?.message}`);

let granted = 0;
let readAsNone = 0;
let carriedUnknown = 0;
const mismatched: string[] = [];
for (let i = 0; i < brands.length; i += 8) {
  await Promise.all(
    brands.slice(i, i + 8).map(async ({ id }: { id: string }) => {
      const raw = await admin.schema('billing').rpc('get_brand_entitlements', { p_brand_id: id });
      const rawProducts: string[] = raw.data?.products ?? [];
      if (rawProducts.length === 0) return;
      granted += 1;
      if (unknownOf(rawProducts, PRODUCT_CODES).length > 0) carriedUnknown += 1;
      const access = await readBrandAccess(id, admin as unknown as BrandAccessClient);
      const expected = rawProducts.filter((code) =>
        (PRODUCT_CODES as readonly string[]).includes(code),
      );
      if (access.products.length === 0) readAsNone += 1;
      if (access.products.join() !== expected.join()) mismatched.push(id);
    }),
  );
}
check(`${brands.length} brands read, ${granted} granted products`, granted > 0);
check(
  'brands carrying a code this build does not know',
  carriedUnknown > 0,
  `${carriedUnknown} (proves the bench exercises the drift)`,
);
check('no granted brand reads as "no products"', readAsNone === 0, `${readAsNone} did`);
check(
  'every brand keeps exactly its known products',
  mismatched.length === 0,
  mismatched.slice(0, 5).join(', '),
);

// 2. The live overview the Billing panel parses.
const token = await mintAccessTokenForEmail(BENCH_OWNER_EMAIL);
const response = await fetch(`${url}/functions/v1/billing-api/brands/${BENCH_BRAND_ID}/overview`, {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await response.json();
check('live overview answers 200', response.ok, String(response.status));
const drift = [
  ...unknownOf(body.entitlements?.products, PRODUCT_CODES),
  ...unknownOf(
    (body.catalog?.plans ?? []).map((plan: { planCode: string }) => plan.planCode),
    PLAN_CODES,
  ),
];
console.log(`· overview codes this build does not know: ${drift.join(', ') || 'none'}`);
const parsed = billingOverviewSchema.safeParse(body);
check(
  'Billing panel parses the live overview',
  parsed.success,
  parsed.error?.message.slice(0, 300),
);

console.log(failures === 0 ? 'PASS' : `FAIL — ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
