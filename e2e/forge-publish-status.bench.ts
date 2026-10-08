#!/usr/bin/env bun
/** Real published source → authenticated Backend API → Forge check table HTML. */
import { strict as assert } from 'node:assert';
import { apiRenderTemplateContractSchema, templateSourceSchema } from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckTable } from '@/components/forge/CheckTable';
import { templateChecks } from '@/components/forge/templateChecks';

const brandId = process.env.FORGE_PUBLISH_BENCH_BRAND_ID ?? '1d1eac52-2955-42bd-81b5-a47808214ae2';
const assetId = process.env.FORGE_PUBLISH_BENCH_ASSET_ID ?? 'cb0036b0-dd48-4136-b98c-c04f7eb8883b';
const ownerEmail = process.env.FORGE_PUBLISH_BENCH_OWNER_EMAIL ?? 'marcos@continuumai.agency';
const apiUrl = (process.env.API_URL ?? 'https://api.trycontinuum.ai').replace(/\/$/, '');
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anonKey && serviceKey, 'Hosted Supabase credentials are required');
assert(/^https:\/\//.test(apiUrl) && /^https:\/\//.test(supabaseUrl), 'Bench must use hosted services');

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: ownerEmail });
assert.ifError(link.error);
assert(link.data.properties?.hashed_token, 'Owner magic link has no token hash');
const owner = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const verified = await owner.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
});
assert.ifError(verified.error);
const token = verified.data.session?.access_token;
assert(token, 'Owner session is missing');

async function read(path: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response.json();
}

const query = `brandId=${encodeURIComponent(brandId)}`;
const source = templateSourceSchema.parse(await read(`/api/ai-studio/templates/${assetId}?${query}`));
assert(source.templateKey && source.forgeState === 'published', 'Source must be published');
const run = await read(`/api/ai-studio/templates/${assetId}/run?${query}`);
assert((run as { run?: { state?: string } }).run?.state === 'published', 'Forge run must be published');
const contract = apiRenderTemplateContractSchema.parse(
  await read(`/api/ai-studio/renders/templates/${source.templateKey}/contract?${query}`),
);
const publish = templateChecks({
  parseState: source.parseState,
  parseError: source.parseError,
  variableCount: source.slotCount,
  formatCount: source.ratios.length,
  fontReadiness: null,
  fontCheckFailed: false,
  run: null,
  forgeState: source.forgeState,
  templateKey: source.templateKey,
  publishVerification: contract.publishCheck,
}).find((check) => check.id === 'publish');
assert(publish, 'Publish check is missing');
const html = renderToStaticMarkup(createElement(CheckTable, { rows: [publish] }));
assert.equal(publish.state, 'pass', 'Published source must not show Publish running');
assert.match(html, /Published/);
assert.doesNotMatch(html, /aria-label="Running"/);
console.log(JSON.stringify({ bench: 'forge:publish-status:e2e:bench', result: 'PASS',
  templateKey: source.templateKey, publishState: publish.state, htmlBytes: html.length }));
