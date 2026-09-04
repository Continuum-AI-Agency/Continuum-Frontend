#!/usr/bin/env bun

// End-to-end proof for the /admin brand-tier control, across the real boundary:
// browser client -> deployed `admin-update-tier` edge function -> hosted
// brand_profiles.brand_profiles row.
//
// It grades the two things the UI got wrong in production on 2026-09-01:
//   1. a non-admin session must surface the function's own reason ("Forbidden"),
//      not supabase-js's constant "Edge Function returned a non-2xx status code";
//   2. an admin session must actually move the row's `tier`.
//
// Credentials come from Continuum-Backend/.env on purpose. Bun auto-loads
// Continuum-Frontend/.env.local, which points at the LOCAL Supabase stack —
// inheriting it would bench a function that isn't deployed there.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';

const TAG = '[admin:tier:e2e:bench]';
const BRAND_ID = process.env.ADMIN_TIER_BENCH_BRAND_ID ?? '705e2282-c573-4c42-bc13-9ffc90b6ae45';
const ADMIN_EMAIL = process.env.ADMIN_TIER_BENCH_ADMIN_EMAIL ?? 'duane@continuumai.agency';
const NON_ADMIN_EMAIL = process.env.ADMIN_TIER_BENCH_USER_EMAIL ?? 'trycontinuumai@gmail.com';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`${TAG} ${message}`);
  console.log(`✓ ${message}`);
}

function hostedEnv(): { url: string; anonKey: string; serviceKey: string } {
  const path = resolve(import.meta.dir, '../../Continuum-Backend/.env');
  const values = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values.set(match[1], match[2].trim().replace(/^["']|["']$/g, ''));
  }
  const read = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`${TAG} Missing ${name} in ${path}`);
    return value;
  };
  return {
    url: read('SUPABASE_URL').replace(/\/$/, ''),
    anonKey: read('SUPABASE_ANON_KEY'),
    serviceKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

const { url, anonKey, serviceKey } = hostedEnv();
assert(
  /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url),
  'targets the hosted Supabase project, not the local stack',
);

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// A real session for a real account, the way the browser holds one.
async function sessionFor(email: string) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const link = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const hashedToken = link.data.properties?.hashed_token;
  if (!hashedToken) throw new Error(`${TAG} no hashed_token for ${email}`);
  const verified = await client.auth.verifyOtp({ token_hash: hashedToken, type: 'magiclink' });
  if (verified.error) throw verified.error;
  return client;
}

async function readTier(): Promise<number> {
  const { data, error } = await service
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('tier')
    .eq('id', BRAND_ID)
    .single();
  if (error) throw error;
  return data.tier as number;
}

const originalTier = await readTier();
const nextTier = originalTier === 3 ? 2 : 3;
let nonAdmin: Awaited<ReturnType<typeof sessionFor>> | null = null;
let admin: Awaited<ReturnType<typeof sessionFor>> | null = null;

try {
  nonAdmin = await sessionFor(NON_ADMIN_EMAIL);
  const refused = await nonAdmin.functions.invoke('admin-update-tier', {
    method: 'POST',
    body: { brandProfileId: BRAND_ID, tier: nextTier },
  });
  assert(refused.error, 'a non-admin session is refused by admin-update-tier');
  const surfaced = await readEdgeErrorMessage(refused.error, 'Unable to save brand tier.');
  assert(
    surfaced === 'Forbidden',
    `surfaces the function's own reason to the toast (got "${surfaced}")`,
  );
  assert(
    (await readTier()) === originalTier,
    'a refused call leaves the brand tier untouched',
  );

  admin = await sessionFor(ADMIN_EMAIL);
  const accepted = await admin.functions.invoke('admin-update-tier', {
    method: 'POST',
    body: { brandProfileId: BRAND_ID, tier: nextTier },
  });
  assert(!accepted.error, 'an admin session is accepted by admin-update-tier');
  assert(
    (await readTier()) === nextTier,
    `the brand tier moved ${originalTier} -> ${nextTier} in the hosted row`,
  );
} finally {
  // Shared prod store: leave the row and the sessions exactly as found.
  await service
    .schema('brand_profiles')
    .from('brand_profiles')
    .update({ tier: originalTier })
    .eq('id', BRAND_ID);
  await nonAdmin?.auth.signOut();
  await admin?.auth.signOut();
  console.log(`${TAG} restored tier ${originalTier} on ${BRAND_ID}`);
}

console.log(`${TAG} green`);
