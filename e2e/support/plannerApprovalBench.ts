import { randomUUID } from 'node:crypto';
import { statfsSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState, LAST_ONBOARDING_STEP } from '../../src/lib/onboarding/state';
import { mintSessionBundleForEmail, pinSessionBrand } from './auth';
import { createBrand, createUser, grantContract } from './billingBench';

type Platform = 'instagram' | 'linkedin';
type Session = Awaited<ReturnType<typeof mintSessionBundleForEmail>>;
export interface ApprovalBenchActor {
  id: string;
  email: string;
  session: Session;
}

const BUCKET = 'brand-profile-assets';
const STILL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export function assertPlannerApprovalEnvironment(): void {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) {
    const value = process.env[key];
    if (!value && key === 'SUPABASE_URL') continue;
    if (!value || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) {
      throw new Error(`#415 requires a local Supabase target (${key}); refusing fixture writes.`);
    }
  }
  const disk = statfsSync(process.cwd(), { bigint: true });
  if (disk.bavail * disk.bsize < 50n * 1024n ** 3n) {
    throw new Error('#415 requires at least 50 GiB free before running the browser benchmark.');
  }
}

export async function seedPlannerApprovalBench(db: SupabaseClient) {
  assertPlannerApprovalEnvironment();
  const runId = `bug415-${randomUUID()}`;
  const record = (resource: string, identity: Record<string, string>) =>
    console.log(JSON.stringify({ bench: '#415-fixtures', runId, resource, ...identity }));
  record('setup', { status: 'started' });
  const now = new Date().toISOString();
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const password = `${randomUUID()}Aa1!`;
  const identities: Record<'owner' | 'member' | 'outsider', { id: string; email: string }> = {
    owner: { id: '', email: `${runId}-owner@continuum.test` },
    member: { id: '', email: `${runId}-member@continuum.test` },
    outsider: { id: '', email: `${runId}-outsider@continuum.test` },
  };
  for (const identity of Object.values(identities)) {
    identity.id = await createUser(db, identity.email, password);
    record('auth-user', { id: identity.id, email: identity.email });
  }
  record('brand-request', { ownerId: identities.owner.id, name: `${runId} brand` });
  const brandId = await createBrand(db, identities.owner.id, `${runId} brand`);
  record('brand', { id: brandId });
  record('brand-request', { ownerId: identities.outsider.id, name: `${runId} other brand` });
  const outsiderBrandId = await createBrand(db, identities.outsider.id, `${runId} other brand`);
  record('brand', { id: outsiderBrandId });
  for (const id of [brandId, outsiderBrandId]) {
    await db
      .schema('brand_profiles')
      .from('brand_profiles')
      .update({ timezone: 'UTC', tier: 1 })
      .eq('id', id)
      .throwOnError();
    await grantContract(db, id);
    await db
      .schema('brand_trends')
      .from('generations')
      .insert({
        id: randomUUID(),
        brand_id: id,
        week_start_date: weekStart.toISOString().slice(0, 10),
        status: 'completed',
        generated_by: runId,
        selected_social_platforms: ['instagram', 'linkedin'],
        total_trends: 0,
        total_events: 0,
        total_questions: 0,
        started_at: now,
        completed_at: now,
      })
      .throwOnError();
  }
  await db
    .schema('brand_profiles')
    .from('permissions')
    .upsert(
      {
        brand_profile_id: brandId,
        user_id: identities.member.id,
        email: identities.member.email,
        role: 'operator',
      },
      { onConflict: 'brand_profile_id,user_id' },
    )
    .throwOnError();

  async function sessionFor(
    identity: { id: string; email: string },
    activeBrandId: string,
    role: 'owner' | 'operator',
  ): Promise<ApprovalBenchActor> {
    const state = createDefaultOnboardingState({ ...identity, role });
    state.step = LAST_ONBOARDING_STEP;
    state.completedAt = now;
    state.brand.name = `${runId} brand`;
    state.brand.timezone = 'UTC';
    await db
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .upsert(
        {
          user_id: identity.id,
          brand_id: activeBrandId,
          state,
          is_active: true,
        },
        { onConflict: 'user_id,brand_id' },
      )
      .throwOnError();
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        {
          user_id: identity.id,
          active_brand_id: activeBrandId,
        },
        { onConflict: 'user_id' },
      )
      .throwOnError();
    const session = await mintSessionBundleForEmail(identity.email);
    await pinSessionBrand(session.accessToken, activeBrandId);
    return { ...identity, session };
  }

  const actors = {
    owner: await sessionFor(identities.owner, brandId, 'owner'),
    member: await sessionFor(identities.member, brandId, 'operator'),
    outsider: await sessionFor(identities.outsider, outsiderBrandId, 'owner'),
  };
  const accountIds = { instagram: randomUUID(), linkedin: randomUUID() };
  for (const platform of ['instagram', 'linkedin'] as const) {
    const integrationId = randomUUID();
    record('integration-request', { id: integrationId, accountId: accountIds[platform], brandId });
    const type = platform === 'instagram' ? 'meta_instagram_account' : 'linkedin_organization';
    const externalId = `${runId}-${platform}`;
    const { data: encryptedToken, error } = await db.schema('brand_profiles').rpc('encrypt_token', {
      token: `local-bench-only-${randomUUID()}`,
    });
    if (error) throw new Error(`Local fixture token encryption failed: ${error.message}`);
    await db
      .schema('brand_profiles')
      .from('user_integrations')
      .insert({
        id: integrationId,
        user_id: actors.owner.id,
        provider: platform === 'instagram' ? 'meta' : 'linkedin',
        platform_user_id: externalId,
        status: 'active',
        access_token_encrypted: encryptedToken,
        refresh_token_encrypted: encryptedToken,
        expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        metadata: { benchTag: runId },
      })
      .throwOnError();
    await db
      .schema('brand_profiles')
      .from('brand_integration_grants')
      .insert({
        brand_profile_id: brandId,
        integration_id: integrationId,
        granted_by: actors.owner.id,
      })
      .throwOnError();
    await db
      .schema('brand_profiles')
      .from('integration_accounts_assets')
      .insert({
        id: accountIds[platform],
        integration_id: integrationId,
        external_account_id: externalId,
        type,
        name: `${runId} ${platform}`,
        status: 'active',
        raw_payload: platform === 'instagram' ? { username: `${runId}_ig` } : {},
      })
      .throwOnError();
    await db
      .schema('brand_profiles')
      .from('brand_profile_integration_accounts')
      .insert({
        brand_profile_id: brandId,
        integration_account_id: accountIds[platform],
        integration_id: integrationId,
        external_id: externalId,
        type,
        name: `${runId} ${platform}`,
        is_primary: true,
      })
      .throwOnError();
  }
  const bucket = await db.storage.getBucket(BUCKET);
  if (!bucket.data) {
    const created = await db.storage.createBucket(BUCKET, { public: false });
    if (created.error) throw new Error(created.error.message);
  }
  const storagePath = `${brandId}/organic/bench/${runId}/still.png`;
  record('storage-upload-request', { bucket: BUCKET, path: storagePath });
  const upload = await db.storage
    .from(BUCKET)
    .upload(storagePath, STILL, { contentType: 'image/png', upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  record('storage-object', { bucket: BUCKET, path: storagePath });

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60_000);
  scheduledAt.setUTCHours(10, 0, 0, 0);
  if (scheduledAt.getTime() - Date.now() < 12 * 60 * 60_000)
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
  const scheduledDate = scheduledAt.toISOString();
  const dayId = scheduledDate.slice(0, 10);
  const draftIds: string[] = [];

  async function seedDraft(
    platform: Platform,
    creatorId: string,
    label: string,
    options: {
      groupId?: string;
      clientKey?: string;
      accountId?: string;
    } = {},
  ) {
    const id = randomUUID();
    record('draft-request', { id, brandId, creatorId });
    const clientKey = options.clientKey ?? `${runId}-${id}`;
    const title = `#415 ${label} ${platform} ${id.slice(0, 8)}`;
    const content = {
      content: { format: 'POST', titleTopic: title },
      copy: {
        caption: `${title}: a real local scheduling fixture.`,
        hashtags: { high: [], medium: [], low: [] },
      },
      quality: { passed: true },
      creative: { mediaSuggestion: { mediaStatus: 'ready' } },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 0,
          bucket: BUCKET,
          storagePath,
          mimeType: 'image/png',
          width: 1,
          height: 1,
          storageUrl: '',
        },
      ],
    };
    await db
      .schema('organic')
      .from('organic_calendar_drafts')
      .insert({
        id,
        brand_id: brandId,
        user_id: creatorId,
        platform,
        platform_account_id: options.accountId ?? accountIds[platform],
        status: 'draft',
        scheduled_date: scheduledDate,
        client_key: clientKey,
        group_id: options.groupId ?? null,
        media_stage: 'realized',
        slot_data: { placementId: clientKey, title, platform, dayId, timeLabel: '10:00 AM' },
        content_json: content,
      })
      .throwOnError();
    draftIds.push(id);
    return { id, title, scheduledDate, content, clientKey };
  }

  async function readDraft(id: string) {
    const { data, error } = await db
      .schema('organic')
      .from('organic_calendar_drafts')
      .select(
        'id, brand_id, user_id, status, scheduled_date, platform, platform_account_id, content_json, updated_at',
      )
      .eq('id', id)
      .eq('brand_id', brandId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  return { runId, brandId, actors, accountIds, seedDraft, readDraft, draftIds };
}
