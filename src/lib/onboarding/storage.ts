import type { SupabaseClient, User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { PlatformKey } from '@/components/onboarding/platforms';
import { getFunctionsInvokeErrorMessage } from '@/lib/supabase/functions-errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/types';
import { canPersistBrandRecord } from './brandRecordGuard';
import { claimPendingInvite } from './claimInvite';
import {
  findMatchingActiveBrandId,
  findPendingInviteBrandId,
  findReusableBrandId,
} from './reusableBrand';
import {
  BRAND_ROLES,
  type BrandInvite,
  type BrandMember,
  type BrandRole,
  createBrandId,
  createDefaultMetadata,
  createDefaultOnboardingState,
  type DocumentCategory,
  ensureBrandExists,
  mergeOnboardingState,
  type OnboardingDocument,
  type OnboardingMetadata,
  type OnboardingPatch,
  type OnboardingState,
  parseOnboardingMetadata,
  repairOnboardingState,
} from './state';

type SupabaseOnboardingClient = SupabaseClient<Database>;

type AuthContext = {
  supabase: SupabaseOnboardingClient;
  user: User;
  owner: BrandMember;
};

type OnboardingContext = {
  metadata: OnboardingMetadata;
  state: OnboardingState;
  brandId: string;
  owner: BrandMember;
  supabase: SupabaseOnboardingClient;
  user: User;
};

function getOwnerMember(user: User): BrandMember {
  const email = user.email ?? `${user.id}@continuum.local`;
  return {
    id: user.id,
    email,
    role: 'owner',
  };
}

async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return { supabase, user, owner: getOwnerMember(user) };
}

const ONBOARDING_SCHEMA = 'brand_profiles';
const ONBOARDING_TABLE = 'user_onboarding_states';

function resolveBrandProfileName(state?: OnboardingState): string {
  const candidate = state?.brand?.name?.trim();
  if (candidate && candidate.length > 0) {
    return candidate;
  }
  return 'Untitled Brand';
}

/**
 * Ensures a `brand_profiles.brand_profiles` row exists for `brandId` and
 * syncs global fields the caller's onboarding state owns. Returns the brand
 * id the caller should actually use: normally the same `brandId` it was
 * given, but if the row doesn't exist yet AND an active brand the user
 * already has access to matches this candidate by name or website (ticket
 * #162 defense-in-depth), it short-circuits to that EXISTING brand id instead
 * of inserting a duplicate. Callers must adopt the returned id (it may not
 * equal the id passed in) rather than assuming they are the same.
 */
async function ensureBrandProfileRecord(
  supabase: SupabaseOnboardingClient,
  brandId: string,
  owner: BrandMember,
  state?: OnboardingState,
  options: { reuseMatchingBrand?: boolean } = {},
): Promise<string> {
  const { data: rawData, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id, brand_name, logo_path, completed_at, created_by, email_report_opt_in')
    .eq('id', brandId)
    .maybeSingle();

  const data = rawData as {
    id: string;
    brand_name: string | null;
    logo_path: string | null;
    completed_at: string | null;
    created_by: string | null;
    email_report_opt_in: boolean | null;
  } | null;

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  // Only the brand's creator may persist global fields from their onboarding
  // state. An invited member's state name is defaulted to "<their-name>'s Brand";
  // letting them write it overwrote the canonical brand_name for everyone (the
  // shell, the switcher). Invited members are read-only on the brand row.
  if (!canPersistBrandRecord(data, owner.id)) {
    await claimPendingInvite(supabase, brandId, owner.id);
    return brandId;
  }

  const brandName = resolveBrandProfileName(state);
  const logoPath = state?.brand?.logoPath ?? null;
  const completedAt = state?.completedAt ?? null;
  // The end-of-onboarding toggle. Persisted on the same row whose completed_at
  // fires the first-value report enqueue trigger, so the trigger reads the
  // user's choice at completion. Defaults to opt-in.
  const emailReportOptIn = state?.emailReportOptIn ?? true;

  if (!data) {
    if (options.reuseMatchingBrand !== false) {
      const duplicateBrandId = await findMatchingActiveBrandId(supabase, owner.id, {
        brandName,
        websiteUrl: state?.brand?.website ?? null,
      });
      if (duplicateBrandId && duplicateBrandId !== brandId) {
        return duplicateBrandId;
      }
    }

    const { error: insertError } = await supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .insert({
        id: brandId,
        brand_name: brandName,
        logo_path: logoPath,
        created_by: owner.id,
        completed_at: completedAt,
        email_report_opt_in: emailReportOptIn,
      });

    if (insertError) {
      // 23505 = the brand already exists; our SELECT just didn't see it (e.g.
      // RLS visibility). It already has an owner permission row from its initial
      // creation, so do NOT re-seed permissions here. That redundant upsert can
      // trip a self-referential RLS check (Postgres 54001) and 500 routine writes
      // such as a logo update. Treat the row as present and stop.
      if (insertError.code === '23505') {
        return brandId;
      }
      throw insertError;
    }

    // Genuine first-time creation — seed the owner permission once.
    await supabase
      .schema('brand_profiles')
      .from('permissions')
      .upsert(
        {
          brand_profile_id: brandId,
          user_id: owner.id,
          role: 'owner',
        },
        { onConflict: 'brand_profile_id,user_id' } as any,
      );

    return brandId;
  }

  if (
    data.brand_name !== brandName ||
    data.logo_path !== logoPath ||
    data.completed_at !== completedAt ||
    (data.email_report_opt_in ?? true) !== emailReportOptIn
  ) {
    const { error: updateError } = await supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .update({
        brand_name: brandName,
        logo_path: logoPath,
        completed_at: completedAt,
        email_report_opt_in: emailReportOptIn,
        updated_at: new Date().toISOString(),
      })
      .eq('id', brandId);

    if (updateError) {
      if (updateError.code === '42501') {
        console.warn(
          `[ensureBrandExists] User ${owner.id} lacks permission to update brand ${brandId}`,
          updateError,
        );
      } else {
        throw updateError;
      }
    }
  }

  return brandId;
}

const DOCUMENT_SOURCE_VALUES = new Set<OnboardingDocument['source']>([
  'upload',
  'canva',
  'figma',
  'google-drive',
  'sharepoint',
  'notion',
  'website',
]);

type BrandDocumentRow = {
  id: string;
  brand_id: string;
  name: string;
  status: string | null;
  error_message: string | null;
  type: string | null;
  source: string | null;
  created_at: string;
  updated_at: string | null;
  size?: number | null;
  storage_path?: string | null;
  external_url?: string | null;
};

function normalizeDocumentStatus(status: string | null): OnboardingDocument['status'] {
  if (status === 'ready' || status === 'error') {
    return status;
  }
  return 'processing';
}

function normalizeDocumentSource(
  source: string | null,
  fallback: OnboardingDocument['source'],
): OnboardingDocument['source'] {
  if (source && DOCUMENT_SOURCE_VALUES.has(source as OnboardingDocument['source'])) {
    return source as OnboardingDocument['source'];
  }
  return fallback;
}

function documentsEqual(a: OnboardingDocument, b: OnboardingDocument): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.source === b.source &&
    a.createdAt === b.createdAt &&
    a.status === b.status &&
    (a.size ?? null) === (b.size ?? null) &&
    (a.externalUrl ?? null) === (b.externalUrl ?? null) &&
    (a.storagePath ?? null) === (b.storagePath ?? null) &&
    (a.jobId ?? null) === (b.jobId ?? null) &&
    (a.errorMessage ?? null) === (b.errorMessage ?? null)
  );
}

function mergeDocumentFromRow(
  existing: OnboardingDocument | undefined,
  row: BrandDocumentRow,
): OnboardingDocument {
  const sourceFallback = existing?.source ?? 'upload';
  const status = normalizeDocumentStatus(row.status);
  const createdAt =
    existing?.createdAt ?? row.created_at ?? row.updated_at ?? new Date().toISOString();

  const merged: OnboardingDocument = {
    id: row.id,
    name:
      typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name
        : (existing?.name ?? 'Document'),
    source: normalizeDocumentSource(row.source, sourceFallback),
    createdAt,
    status,
  };

  const size = typeof row.size === 'number' ? row.size : existing?.size;
  if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
    merged.size = size;
  }

  const externalUrl = row.external_url ?? existing?.externalUrl;
  if (typeof externalUrl === 'string' && externalUrl.length > 0) {
    merged.externalUrl = externalUrl;
  }

  const storagePath = row.storage_path ?? existing?.storagePath;
  if (typeof storagePath === 'string' && storagePath.length > 0) {
    merged.storagePath = storagePath;
  }

  if (existing?.jobId) {
    merged.jobId = existing.jobId;
  }

  if (status === 'error') {
    const errorMessage = row.error_message?.trim() || existing?.errorMessage;
    if (errorMessage) {
      merged.errorMessage = errorMessage;
    }
  }

  return merged;
}

async function syncBrandDocuments(
  supabase: SupabaseOnboardingClient,
  metadata: OnboardingMetadata,
  brandId: string,
): Promise<boolean> {
  const state = metadata.brands[brandId];
  if (!state) {
    return false;
  }

  const { data, error } = (await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .select(
      'id, name, source, status, size, storage_path, external_url, error_message, created_at, updated_at',
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: true })) as {
    data: BrandDocumentRow[] | null;
    error: unknown;
  };

  if (error) {
    const message = (error as { message?: string })?.message ?? 'Unknown error';
    console.warn('Failed to sync brand documents', message);
    return false;
  }

  const rows = data ?? [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const updatedDocuments: OnboardingDocument[] = [];
  let dirty = false;

  for (const document of state.documents) {
    const row = rowsById.get(document.id);
    if (!row) {
      updatedDocuments.push(document);
      continue;
    }

    const merged = mergeDocumentFromRow(document, row);
    if (!documentsEqual(document, merged)) {
      dirty = true;
    }
    updatedDocuments.push(merged);
    rowsById.delete(document.id);
  }

  for (const row of rowsById.values()) {
    const merged = mergeDocumentFromRow(undefined, row);
    updatedDocuments.push(merged);
    dirty = true;
  }

  if (dirty) {
    metadata.brands[brandId] = mergeOnboardingState(state, { documents: updatedDocuments });
  }

  return dirty;
}

function ensureActiveSelection(metadata: OnboardingMetadata): OnboardingMetadata {
  if (!metadata.activeBrandId) {
    const firstBrand = Object.keys(metadata.brands)[0];
    if (firstBrand) {
      metadata.activeBrandId = firstBrand;
    }
  }
  return metadata;
}

async function fetchMetadataFromTable(
  supabase: SupabaseOnboardingClient,
  userId: string,
  owner: BrandMember,
): Promise<OnboardingMetadata> {
  const { data, error } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .select('brand_id, state, is_active')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const metadata: OnboardingMetadata = {
    activeBrandId: null,
    brands: {},
  };

  let activeBrandId: string | null = null;
  const repairedRows: Array<{
    user_id: string;
    brand_id: string;
    state: Json;
    is_active: boolean;
    updated_at: string;
  }> = [];

  for (const row of data ?? []) {
    const repaired = repairOnboardingState(row.state, owner);
    metadata.brands[row.brand_id] = repaired.state;
    if (repaired.repaired) {
      repairedRows.push({
        user_id: userId,
        brand_id: row.brand_id,
        state: repaired.state as unknown as Json,
        is_active: Boolean(row.is_active),
        updated_at: new Date().toISOString(),
      });
      console.warn('[onboarding.state] repaired persisted state', {
        brandId: row.brand_id,
        issueCount: repaired.issues.length,
      });
    }
    if (row.is_active && !activeBrandId) {
      activeBrandId = row.brand_id;
    }
  }

  if (repairedRows.length > 0) {
    const { error: repairError } = await supabase
      .schema(ONBOARDING_SCHEMA)
      .from(ONBOARDING_TABLE)
      .upsert(repairedRows, { onConflict: 'user_id,brand_id' });
    if (repairError) {
      throw repairError;
    }
  }

  metadata.activeBrandId = activeBrandId ?? null;
  ensureActiveSelection(metadata);
  return metadata;
}

async function updateUserOnboardingMetadata(
  supabase: SupabaseOnboardingClient,
  activeBrandId: string | null,
): Promise<void> {
  const onboardingPayload = activeBrandId ? { activeBrandId } : null;
  const { error } = await supabase.auth.updateUser({
    data: { onboarding: onboardingPayload },
  });
  if (error) {
    throw error;
  }
}

async function upsertUserBrandPreference(
  supabase: SupabaseOnboardingClient,
  userId: string,
  brandId: string,
): Promise<void> {
  const { error } = await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences' as any)
    .upsert(
      {
        user_id: userId,
        active_brand_id: brandId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' } as any,
    );

  if (error) {
    throw error;
  }
}

async function upsertMetadataRows(
  supabase: SupabaseOnboardingClient,
  userId: string,
  metadata: OnboardingMetadata,
): Promise<void> {
  const entries = Object.entries(metadata.brands);
  const now = new Date().toISOString();

  if (entries.length === 0) {
    const { error: deleteError } = await supabase
      .schema(ONBOARDING_SCHEMA)
      .from(ONBOARDING_TABLE)
      .delete()
      .eq('user_id', userId);
    if (deleteError) {
      throw deleteError;
    }
    return;
  }

  const rows = entries.map(([brandId, state]) => ({
    user_id: userId,
    brand_id: brandId,
    state: state as unknown as Json,
    is_active: false,
    updated_at: now,
  }));

  const { error: upsertError } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .upsert(rows, { onConflict: 'user_id,brand_id' });
  if (upsertError) {
    throw upsertError;
  }

  const { data: existing, error: selectError } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .select('brand_id')
    .eq('user_id', userId);
  if (selectError) {
    throw selectError;
  }

  const currentIds = new Set(rows.map((row) => row.brand_id));
  const toRemove = (existing ?? [])
    .map((record) => record.brand_id)
    .filter((brandId) => !currentIds.has(brandId));

  if (toRemove.length > 0) {
    const { error: cleanupError } = await supabase
      .schema(ONBOARDING_SCHEMA)
      .from(ONBOARDING_TABLE)
      .delete()
      .eq('user_id', userId)
      .in('brand_id', toRemove);
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

async function deactivateActiveBrand(
  supabase: SupabaseOnboardingClient,
  userId: string,
  excludeBrandId?: string,
): Promise<void> {
  const { error } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('brand_id', excludeBrandId ?? '');

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
}

async function upsertActiveBrand(
  supabase: SupabaseOnboardingClient,
  userId: string,
  brandId: string,
  state: OnboardingState,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .upsert(
      [
        {
          user_id: userId,
          brand_id: brandId,
          state: state as unknown as Json,
          is_active: true,
          updated_at: now,
        },
      ],
      { onConflict: 'user_id,brand_id' },
    );

  if (error) {
    throw error;
  }
}

async function persistBrandState(
  supabase: SupabaseOnboardingClient,
  userId: string,
  brandId: string,
  state: OnboardingState,
): Promise<void> {
  const { data, error } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .update({
      state: state as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('brand_id', brandId)
    .select('brand_id')
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  if (data) {
    return;
  }

  const { error: insertError } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .upsert(
      {
        user_id: userId,
        brand_id: brandId,
        state: state as unknown as Json,
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,brand_id' },
    );
  if (insertError) {
    throw insertError;
  }
}

async function persistMetadata(
  supabase: SupabaseOnboardingClient,
  user: User,
  metadata: OnboardingMetadata,
): Promise<void> {
  ensureActiveSelection(metadata);
  await upsertMetadataRows(supabase, user.id, metadata);

  if (metadata.activeBrandId) {
    await deactivateActiveBrand(supabase, user.id, metadata.activeBrandId);
    const activeState = metadata.brands[metadata.activeBrandId];
    if (activeState) {
      await upsertActiveBrand(supabase, user.id, metadata.activeBrandId, activeState);
    }
  }

  await updateUserOnboardingMetadata(supabase, metadata.activeBrandId ?? null);
}

function parseLegacyMetadata(raw: unknown): OnboardingMetadata | null {
  if (!raw) {
    return null;
  }
  const parsed = parseOnboardingMetadata(raw);
  if (Object.keys(parsed.brands).length === 0) {
    return null;
  }
  return ensureActiveSelection(parsed);
}

function ensureActiveBrand(
  metadata: OnboardingMetadata,
  owner: BrandMember,
  preferredBrandId?: string,
): { metadata: OnboardingMetadata; brandId: string; dirty: boolean } {
  let dirty = false;
  let brandId = preferredBrandId ?? metadata.activeBrandId ?? null;

  if (brandId && !metadata.brands[brandId]) {
    metadata = ensureBrandExists(metadata, brandId, owner);
    dirty = true;
  }

  if (!brandId) {
    brandId = createBrandId();
    if (!metadata.brands[brandId]) {
      metadata.brands[brandId] = createDefaultOnboardingState(owner);
      dirty = true;
    }
    metadata.activeBrandId = brandId;
    dirty = true;
  }

  if (!metadata.brands[brandId]) {
    metadata.brands[brandId] = createDefaultOnboardingState(owner);
    dirty = true;
  }

  if (metadata.activeBrandId !== brandId) {
    metadata.activeBrandId = brandId;
    dirty = true;
  }

  return { metadata, brandId, dirty };
}

async function loadOnboardingContext(requestedBrandId?: string): Promise<OnboardingContext> {
  const { supabase, user, owner } = await getAuthContext();

  let metadata = await fetchMetadataFromTable(supabase, user.id, owner);
  const legacy = parseLegacyMetadata(user.user_metadata?.onboarding);

  if (legacy) {
    if (Object.keys(metadata.brands).length === 0) {
      metadata = legacy;
      await persistMetadata(supabase, user, metadata);
    } else {
      await updateUserOnboardingMetadata(
        supabase,
        metadata.activeBrandId ?? legacy.activeBrandId ?? null,
      );
    }
  }

  if (Object.keys(metadata.brands).length === 0) {
    // Prefer a brand the user already has access to (owner OR member). If none,
    // check for a PENDING invite by email BEFORE minting a new brand: an invited
    // user has no permissions row until they accept, so findReusableBrandId can't
    // see the invited brand and they'd otherwise fall through to a junk
    // "<name>'s Brand" INSERT instead of joining the brand they were invited to.
    const reusableBrandId =
      (await findReusableBrandId(supabase, owner.id)) ??
      (await findPendingInviteBrandId(supabase, owner.email));
    const initialBrandId = reusableBrandId ?? createBrandId();
    metadata = createDefaultMetadata(initialBrandId, owner);
    await persistMetadata(supabase, user, metadata);
  }

  let {
    metadata: normalizedMetadata,
    brandId,
    dirty,
  } = ensureActiveBrand(metadata, owner, requestedBrandId);

  if (dirty) {
    await persistMetadata(supabase, user, normalizedMetadata);
  }

  const documentsDirty = await syncBrandDocuments(supabase, normalizedMetadata, brandId);

  if (documentsDirty) {
    await persistMetadata(supabase, user, normalizedMetadata);
  }

  const resolvedBrandId = await ensureBrandProfileRecord(
    supabase,
    brandId,
    owner,
    normalizedMetadata.brands[brandId],
  );

  if (resolvedBrandId !== brandId) {
    // ensureBrandProfileRecord found an existing brand matching this
    // candidate by name/website (ticket #162 duplicate guard) instead of
    // inserting a new row — move this user's onboarding state onto the
    // EXISTING brand id rather than tracking the one we were about to mint.
    const pendingState = normalizedMetadata.brands[brandId];
    delete normalizedMetadata.brands[brandId];
    if (!normalizedMetadata.brands[resolvedBrandId]) {
      normalizedMetadata.brands[resolvedBrandId] = pendingState;
    }
    normalizedMetadata.activeBrandId = resolvedBrandId;
    brandId = resolvedBrandId;
    await persistMetadata(supabase, user, normalizedMetadata);
  } else {
    // If ensureBrandProfileRecord updated the state (e.g. synced completedAt), persist it.
    // We check if it's different from what we loaded.
    const finalState = normalizedMetadata.brands[brandId];
    if (JSON.stringify(finalState) !== JSON.stringify(metadata.brands[brandId])) {
      await persistMetadata(supabase, user, normalizedMetadata);
    }
  }

  return {
    metadata: normalizedMetadata,
    state: normalizedMetadata.brands[brandId],
    brandId,
    owner,
    supabase,
    user,
  };
}

export async function fetchOnboardingMetadata(): Promise<OnboardingMetadata> {
  const context = await fetchOnboardingContext();
  return context.metadata;
}

export async function ensureOnboardingState(
  brandId?: string,
): Promise<{ brandId: string; state: OnboardingState }> {
  const context = await fetchOnboardingContext(brandId);
  return { brandId: context.brandId, state: context.state };
}

export async function fetchOnboardingState(brandId: string): Promise<OnboardingState> {
  const context = await fetchOnboardingContext(brandId);
  return context.state;
}

// cache() deduplicates within a single server request — multiple pages/components
// calling ensureOnboardingState() with the same brandId only run once.
export const fetchOnboardingContext = cache(
  async (
    brandId?: string,
  ): Promise<{ metadata: OnboardingMetadata; state: OnboardingState; brandId: string }> => {
    const context = await loadOnboardingContext(brandId);
    return { metadata: context.metadata, state: context.state, brandId: context.brandId };
  },
);

async function updateBrandState(
  brandId: string,
  mutate: (state: OnboardingState) => OnboardingState,
): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);
  const nextState = mutate(context.state);
  context.metadata.brands[context.brandId] = nextState;
  await persistBrandState(context.supabase, context.user.id, context.brandId, nextState);
  await ensureBrandProfileRecord(context.supabase, context.brandId, context.owner, nextState);
  return nextState;
}

export async function applyOnboardingPatch(
  brandId: string,
  patch: OnboardingPatch,
): Promise<OnboardingState> {
  return updateBrandState(brandId, (state) => mergeOnboardingState(state, patch));
}

export async function appendDocument(
  brandId: string,
  document: OnboardingDocument,
): Promise<OnboardingState> {
  return updateBrandState(brandId, (state) => {
    const nextDocuments = [
      ...state.documents.filter((doc: OnboardingDocument) => doc.id !== document.id),
      document,
    ];
    return mergeOnboardingState(state, { documents: nextDocuments });
  });
}

/**
 * Take a document down. This is a SOFT delete: the row survives, its chunks are
 * purged by the lifecycle sweep, and the storage object is retained for a recovery
 * window before the purge worker frees it.
 *
 * Replaces the previous hard delete, which removed the row and left the file behind —
 * the reason 18 objects in prod have no owning row.
 */
export async function archiveDocument(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  const { supabase, user } = await getAuthContext();

  await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .update({
      archived_at: new Date().toISOString(),
      archived_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('brand_id', brandId)
    .is('archived_at', null);

  return updateBrandState(brandId, (state) => {
    const documents = state.documents.filter((doc: OnboardingDocument) => doc.id !== documentId);
    return mergeOnboardingState(state, { documents });
  });
}

/**
 * Undo an archive. Deliberately does NOT re-embed: chunks were purged on archive, so
 * a restored document is visible and downloadable but not yet searchable until it is
 * re-ingested. Surfacing that honestly beats silently spending an embed.
 */
export async function restoreDocument(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .update({
      archived_at: null,
      archived_by: null,
      purge_after: null,
      purge_claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('brand_id', brandId);

  return updateBrandState(brandId, (state) => state);
}

/**
 * Hard delete, offered only from the Archived view. Removes the storage object too —
 * the old delete path did not, which is how orphans accumulated.
 */
export async function deleteDocumentPermanently(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  const { data: row } = await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .select('storage_path, superseded_storage_paths')
    .eq('id', documentId)
    .eq('brand_id', brandId)
    .maybeSingle();

  const paths = [
    (row as { storage_path?: string | null } | null)?.storage_path,
    ...((row as { superseded_storage_paths?: string[] } | null)?.superseded_storage_paths ?? []),
  ].filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await supabase.storage.from('brand-docs').remove(paths);
  }

  await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .delete()
    .eq('id', documentId)
    .eq('brand_id', brandId);

  return updateBrandState(brandId, (state) => {
    const documents = state.documents.filter((doc: OnboardingDocument) => doc.id !== documentId);
    return mergeOnboardingState(state, { documents });
  });
}

/** Rename only the user-facing label; `name` stays the sanitized storage filename. */
export async function renameDocument(
  brandId: string,
  documentId: string,
  displayName: string,
): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('brand_id', brandId);

  return updateBrandState(brandId, (state) => {
    const documents = state.documents.map((doc: OnboardingDocument) =>
      doc.id === documentId ? { ...doc, name: displayName, displayName } : doc,
    );
    return mergeOnboardingState(state, { documents });
  });
}

/**
 * Promote a one-off upload to permanent brand knowledge. No data moves — the row is
 * already in the same table, bucket and vector index; only its lifecycle flags change.
 * Clearing expires_at is what stops the sweep from ever archiving it.
 */
export async function saveDocumentPermanently(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .update({
      retention: 'permanent',
      expires_at: null,
      scope_key: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('brand_id', brandId)
    .eq('retention', 'ephemeral');

  return updateBrandState(brandId, (state) => state);
}

export async function updateDocumentCategory(
  brandId: string,
  documentId: string,
  category: DocumentCategory,
): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .update({ category, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('brand_id', brandId);

  return updateBrandState(brandId, (state) => {
    const documents = state.documents.map((doc: OnboardingDocument) =>
      doc.id === documentId ? { ...doc, category } : doc,
    );
    return mergeOnboardingState(state, { documents });
  });
}

export async function resetOnboardingState(brandId: string): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);

  await (context.supabase as SupabaseClient)
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .delete()
    .eq('brand_profile_id', context.brandId);

  const resetState = createDefaultOnboardingState(context.owner);
  resetState.brand.name = '';
  resetState.members = [];
  resetState.invites = [];
  context.metadata.brands[context.brandId] = resetState;
  await persistMetadata(context.supabase, context.user, context.metadata);
  return resetState;
}

export async function updateConnectionAccounts(
  brandId: string,
  provider: PlatformKey,
  details: {
    connected?: boolean;
    accountId?: string | null;
    accounts?: OnboardingState['connections'][PlatformKey]['accounts'];
    integrationIds?: OnboardingState['connections'][PlatformKey]['integrationIds'];
    lastSyncedAt?: string | null;
  },
): Promise<OnboardingState> {
  return updateBrandState(brandId, (state) =>
    mergeOnboardingState(state, {
      connections: {
        [provider]: {
          connected: details.connected,
          accountId: details.accountId ?? null,
          accounts: details.accounts,
          integrationIds: details.integrationIds,
          lastSyncedAt:
            details.lastSyncedAt !== undefined ? details.lastSyncedAt : new Date().toISOString(),
        },
      },
    }),
  );
}

export async function setActiveBrand(brandId: string): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);
  const targetState = context.metadata.brands[brandId];
  if (!targetState) {
    throw new Error('Brand not found');
  }

  if (context.metadata.activeBrandId === brandId) {
    return targetState;
  }

  await deactivateActiveBrand(context.supabase, context.user.id, brandId);
  await upsertActiveBrand(context.supabase, context.user.id, brandId, targetState);

  context.metadata.activeBrandId = brandId;
  await updateUserOnboardingMetadata(context.supabase, brandId);
  await upsertUserBrandPreference(context.supabase, context.user.id, brandId);

  return targetState;
}

export async function createBrandProfile(
  name?: string,
): Promise<{ brandId: string; state: OnboardingState }> {
  const { supabase, owner, metadata, user } = await loadOnboardingContext();
  const brandId = createBrandId();
  const state = createDefaultOnboardingState(owner);
  if (name) {
    state.brand.name = name;
  }
  state.members = [];
  state.invites = [];
  metadata.brands[brandId] = state;
  metadata.activeBrandId = brandId;
  await persistMetadata(supabase, user, metadata);

  // "Add brand" is an explicit request for a distinct workspace. Reusing an
  // existing brand with the same default name would silently redirect the user
  // back into their current brand instead of creating the requested one.
  const resolvedBrandId = await ensureBrandProfileRecord(supabase, brandId, owner, state, {
    reuseMatchingBrand: false,
  });
  if (resolvedBrandId !== brandId) {
    // An existing active brand already matches this candidate by name/website
    // (ticket #162 duplicate guard) — reuse it instead of tracking the
    // brand-new id we minted, which never got a physical row.
    delete metadata.brands[brandId];
    if (!metadata.brands[resolvedBrandId]) {
      metadata.brands[resolvedBrandId] = state;
    }
    metadata.activeBrandId = resolvedBrandId;
    await persistMetadata(supabase, user, metadata);
  }

  await upsertUserBrandPreference(supabase, user.id, resolvedBrandId);
  return { brandId: resolvedBrandId, state: metadata.brands[resolvedBrandId] };
}

export async function deleteBrandFromMetadata(
  brandId: string,
): Promise<{ nextActiveBrandId: string | null }> {
  const { supabase, user, owner } = await getAuthContext();
  const metadata = await fetchMetadataFromTable(supabase, user.id, owner);

  if (!metadata.brands[brandId]) {
    return { nextActiveBrandId: metadata.activeBrandId ?? null };
  }

  delete metadata.brands[brandId];
  if (metadata.activeBrandId === brandId) {
    metadata.activeBrandId = null;
  }

  ensureActiveSelection(metadata);

  const { error: deleteStateError } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .delete()
    .eq('user_id', user.id)
    .eq('brand_id', brandId);

  if (deleteStateError) {
    throw deleteStateError;
  }

  await persistMetadata(supabase, user, metadata);

  return { nextActiveBrandId: metadata.activeBrandId ?? null };
}

export async function renameBrandProfile(brandId: string, name: string): Promise<OnboardingState> {
  return updateBrandState(brandId, (state) =>
    mergeOnboardingState(state, {
      brand: { name },
    }),
  );
}

export async function updateBrandLogo(
  brandId: string,
  logoPath: string | null,
): Promise<OnboardingState> {
  return updateBrandState(brandId, (state) =>
    mergeOnboardingState(state, {
      brand: { logoPath },
    }),
  );
}

export async function removeMemberFromBrand(
  brandId: string,
  member: { userId?: string; email?: string },
): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  if (!member.userId && !member.email) {
    throw new Error('Member identifier is required');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Missing session access token');
  }

  const { error } = await supabase.functions.invoke('brand_invite', {
    body: {
      action: 'remove_member',
      brandId,
      userId: member.userId,
      email: member.email,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const message = await getFunctionsInvokeErrorMessage(error);
    throw new Error(message ?? error.message ?? 'Unable to remove member');
  }

  return updateBrandState(brandId, (state) => {
    const members = state.members.filter((memberEntry: BrandMember) => {
      if (member.userId && memberEntry.id === member.userId) {
        return false;
      }
      if (member.email && memberEntry.email === member.email) {
        return false;
      }
      return true;
    });
    return mergeOnboardingState(state, { members });
  });
}

export async function createMagicLinkInvite(
  brandId: string,
  email: string,
  role: BrandRole,
  siteUrl: string,
): Promise<{ link: string; state: OnboardingState }> {
  if (!BRAND_ROLES.includes(role)) {
    throw new Error('Invalid role');
  }

  const { supabase, user } = await getAuthContext();
  const token = `${createBrandId()}${createBrandId()}`;
  const tokenHash = await (async (t: string) => {
    const data = new TextEncoder().encode(t);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  })(token);

  await supabase
    .schema('brand_profiles')
    .from('invites')
    .upsert(
      {
        brand_profile_id: brandId,
        email,
        role,
        token_hash: tokenHash,
        created_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        revoked_at: null,
      },
      { onConflict: 'brand_profile_id,email' } as any,
    );

  const link = `${siteUrl.replace(/\/$/, '')}/invite/callback?token=${token}&brand=${brandId}`;

  const state = await updateBrandState(brandId, (current) => {
    const invites = current.invites.filter((item: BrandInvite) => item.email !== email);
    return mergeOnboardingState(current, { invites });
  });

  return { link, state };
}

export async function revokeInvite(brandId: string, inviteId: string): Promise<OnboardingState> {
  const { supabase } = await getAuthContext();

  await supabase
    .schema('brand_profiles')
    .from('invites')
    .update({ revoked_at: new Date().toISOString() } as any)
    .eq('id', inviteId);

  return updateBrandState(brandId, (state) => {
    const invites = state.invites.filter((invite: BrandInvite) => invite.id !== inviteId);
    return mergeOnboardingState(state, { invites });
  });
}
