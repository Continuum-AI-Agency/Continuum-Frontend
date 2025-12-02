import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BRAND_ROLES,
  type BrandInvite,
  type BrandMember,
  type BrandRole,
  type OnboardingDocument,
  type OnboardingMetadata,
  type OnboardingPatch,
  type OnboardingState,
  createBrandId,
  createDefaultMetadata,
  createDefaultOnboardingState,
  ensureBrandExists,
  mergeOnboardingState,
  normalizeOnboardingState,
  parseOnboardingMetadata,
} from "./state";
import type { PlatformKey } from "@/components/onboarding/platforms";
import type { Database } from "@/lib/supabase/types";

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
    role: "owner",
  };
}

async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user, owner: getOwnerMember(user) };
}

const ONBOARDING_SCHEMA = "brand_profiles";
const ONBOARDING_TABLE = "user_onboarding_states";

function resolveBrandProfileName(state?: OnboardingState): string {
  const candidate = state?.brand?.name?.trim();
  if (candidate && candidate.length > 0) {
    return candidate;
  }
  return "Untitled Brand";
}

async function ensureBrandProfileRecord(
  supabase: SupabaseOnboardingClient,
  brandId: string,
  owner: BrandMember,
  state?: OnboardingState
): Promise<void> {
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, brand_name")
    .eq("id", brandId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  const brandName = resolveBrandProfileName(state);

  if (!data) {
    const { error: insertError } = await supabase
      .schema("brand_profiles")
      .from("brand_profiles")
      .insert({
        id: brandId,
        brand_name: brandName,
        created_by: owner.id,
      });

    if (insertError && insertError.code !== "23505") {
      throw insertError;
    }
    return;
  }

  if (data.brand_name !== brandName) {
    const { error: updateError } = await supabase
      .schema("brand_profiles")
      .from("brand_profiles")
      .update({
        brand_name: brandName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandId);

    if (updateError) {
      throw updateError;
    }
  }
}

const DOCUMENT_SOURCE_VALUES = new Set<OnboardingDocument["source"]>([
  "upload",
  "canva",
  "figma",
  "google-drive",
  "sharepoint",
  "notion",
  "website",
]);

type BrandDocumentRow = Database["brand_profiles"]["Tables"]["brand_documents"]["Row"];

function normalizeDocumentStatus(status: string | null): OnboardingDocument["status"] {
  if (status === "ready" || status === "error") {
    return status;
  }
  return "processing";
}

function normalizeDocumentSource(
  source: string | null,
  fallback: OnboardingDocument["source"]
): OnboardingDocument["source"] {
  if (source && DOCUMENT_SOURCE_VALUES.has(source as OnboardingDocument["source"])) {
    return source as OnboardingDocument["source"];
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
  row: BrandDocumentRow
): OnboardingDocument {
  const sourceFallback = existing?.source ?? "upload";
  const status = normalizeDocumentStatus(row.status);
  const createdAt = existing?.createdAt ?? row.created_at ?? row.updated_at ?? new Date().toISOString();

  const merged: OnboardingDocument = {
    id: row.id,
    name:
      typeof row.name === "string" && row.name.trim().length > 0
        ? row.name
        : existing?.name ?? "Document",
    source: normalizeDocumentSource(row.source, sourceFallback),
    createdAt,
    status,
  };

  const size = typeof row.size === "number" ? row.size : existing?.size;
  if (typeof size === "number" && Number.isFinite(size) && size >= 0) {
    merged.size = size;
  }

  const externalUrl = row.external_url ?? existing?.externalUrl;
  if (typeof externalUrl === "string" && externalUrl.length > 0) {
    merged.externalUrl = externalUrl;
  }

  const storagePath = row.storage_path ?? existing?.storagePath;
  if (typeof storagePath === "string" && storagePath.length > 0) {
    merged.storagePath = storagePath;
  }

  if (existing?.jobId) {
    merged.jobId = existing.jobId;
  }

  if (status === "error") {
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
  brandId: string
): Promise<boolean> {
  const state = metadata.brands[brandId];
  if (!state) {
    return false;
  }

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("brand_documents")
    .select(
      "id, name, source, status, size, storage_path, external_url, error_message, created_at, updated_at"
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Failed to sync brand documents", error.message);
    return false;
  }

  const rows = data ?? [];
  const rowsById = new Map(rows.map(row => [row.id, row]));
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
  userId: string
): Promise<OnboardingMetadata> {
  const { data, error } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .select("brand_id, state, is_active")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const metadata: OnboardingMetadata = {
    activeBrandId: null,
    brands: {},
  };

  let activeBrandId: string | null = null;
  for (const row of data ?? []) {
    metadata.brands[row.brand_id] = normalizeOnboardingState(row.state);
    if (row.is_active && !activeBrandId) {
      activeBrandId = row.brand_id;
    }
  }

  metadata.activeBrandId = activeBrandId ?? null;
  ensureActiveSelection(metadata);
  return metadata;
}

async function updateUserOnboardingMetadata(
  supabase: SupabaseOnboardingClient,
  activeBrandId: string | null
): Promise<void> {
  const onboardingPayload = activeBrandId ? { activeBrandId } : null;
  const { error } = await supabase.auth.updateUser({
    data: { onboarding: onboardingPayload },
  });
  if (error) {
    throw error;
  }
}

async function upsertMetadataRows(
  supabase: SupabaseOnboardingClient,
  userId: string,
  metadata: OnboardingMetadata
): Promise<void> {
  const entries = Object.entries(metadata.brands);
  const now = new Date().toISOString();

  if (entries.length === 0) {
    const { error: deleteError } = await supabase
      .schema(ONBOARDING_SCHEMA)
      .from(ONBOARDING_TABLE)
      .delete()
      .eq("user_id", userId);
    if (deleteError) {
      throw deleteError;
    }
    return;
  }

  const rows = entries.map(([brandId, state]) => ({
    user_id: userId,
    brand_id: brandId,
    state,
    is_active: false,
    updated_at: now,
  }));

  const { error: upsertError } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .upsert(rows, { onConflict: "user_id,brand_id" });
  if (upsertError) {
    throw upsertError;
  }

  const { data: existing, error: selectError } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .select("brand_id")
    .eq("user_id", userId);
  if (selectError) {
    throw selectError;
  }

  const currentIds = new Set(rows.map(row => row.brand_id));
  const toRemove = (existing ?? [])
    .map(record => record.brand_id)
    .filter(brandId => !currentIds.has(brandId));

  if (toRemove.length > 0) {
    const { error: cleanupError } = await supabase
      .schema(ONBOARDING_SCHEMA)
      .from(ONBOARDING_TABLE)
      .delete()
      .eq("user_id", userId)
      .in("brand_id", toRemove);
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

async function deactivateActiveBrand(
  supabase: SupabaseOnboardingClient,
  userId: string,
  excludeBrandId?: string
): Promise<void> {
  const { error } = await supabase
    .schema(ONBOARDING_SCHEMA)
    .from(ONBOARDING_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_active", true)
    .neq("brand_id", excludeBrandId ?? "");

  if (error && error.code !== "PGRST116") {
    throw error;
  }
}

async function upsertActiveBrand(
  supabase: SupabaseOnboardingClient,
  userId: string,
  brandId: string,
  state: OnboardingState
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
          state,
          is_active: true,
          updated_at: now,
        },
      ],
      { onConflict: "user_id,brand_id" }
    );

  if (error) {
    throw error;
  }
}

async function persistMetadata(
  supabase: SupabaseOnboardingClient,
  user: User,
  metadata: OnboardingMetadata
): Promise<void> {
  ensureActiveSelection(metadata);
  await upsertMetadataRows(supabase, user.id, metadata);

  // Set the single active brand in a separate step to avoid partial unique index conflicts.
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
  preferredBrandId?: string
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

async function loadOnboardingContext(
  requestedBrandId?: string
): Promise<OnboardingContext> {
  const { supabase, user, owner } = await getAuthContext();

  let metadata = await fetchMetadataFromTable(supabase, user.id);
  const legacy = parseLegacyMetadata(user.user_metadata?.onboarding);

  if (legacy) {
    if (Object.keys(metadata.brands).length === 0) {
      metadata = legacy;
      await persistMetadata(supabase, user, metadata);
    } else {
      await updateUserOnboardingMetadata(supabase, metadata.activeBrandId ?? legacy.activeBrandId ?? null);
    }
  }

  if (Object.keys(metadata.brands).length === 0) {
    const initialBrandId = createBrandId();
    metadata = createDefaultMetadata(initialBrandId, owner);
    await persistMetadata(supabase, user, metadata);
  }

  const { metadata: normalizedMetadata, brandId, dirty } = ensureActiveBrand(
    metadata,
    owner,
    requestedBrandId
  );

  if (dirty) {
    await persistMetadata(supabase, user, normalizedMetadata);
  }

  const documentsDirty = await syncBrandDocuments(supabase, normalizedMetadata, brandId);

  if (documentsDirty) {
    await persistMetadata(supabase, user, normalizedMetadata);
  }

  await ensureBrandProfileRecord(
    supabase,
    brandId,
    owner,
    normalizedMetadata.brands[brandId]
  );

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
  const context = await loadOnboardingContext();
  return context.metadata;
}

export async function ensureOnboardingState(
  brandId?: string
): Promise<{ brandId: string; state: OnboardingState }> {
  const context = await loadOnboardingContext(brandId);
  return { brandId: context.brandId, state: context.state };
}

export async function fetchOnboardingState(
  brandId: string
): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);
  return context.state;
}

async function updateBrandState(
  brandId: string,
  mutate: (state: OnboardingState) => OnboardingState
): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);
  const nextState = mutate(context.state);
  context.metadata.brands[context.brandId] = nextState;
  await persistMetadata(context.supabase, context.user, context.metadata);
  await ensureBrandProfileRecord(
    context.supabase,
    context.brandId,
    context.owner,
    nextState
  );
  return nextState;
}

export async function applyOnboardingPatch(
  brandId: string,
  patch: OnboardingPatch
): Promise<OnboardingState> {
  return updateBrandState(brandId, state => mergeOnboardingState(state, patch));
}

export async function appendDocument(
  brandId: string,
  document: OnboardingDocument
): Promise<OnboardingState> {
  return updateBrandState(brandId, state => {
    const nextDocuments = [...state.documents.filter(doc => doc.id !== document.id), document];
    return mergeOnboardingState(state, { documents: nextDocuments });
  });
}

export async function removeDocument(
  brandId: string,
  documentId: string
): Promise<OnboardingState> {
  return updateBrandState(brandId, state => {
    const documents = state.documents.filter(doc => doc.id !== documentId);
    return mergeOnboardingState(state, { documents });
  });
}

export async function resetOnboardingState(brandId: string): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);
  const resetState = createDefaultOnboardingState(context.owner);
  resetState.brand.name = "";
  resetState.members = [...context.state.members];
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
    accounts?: OnboardingState["connections"][PlatformKey]["accounts"];
    lastSyncedAt?: string | null;
  }
): Promise<OnboardingState> {
  return updateBrandState(brandId, state =>
    mergeOnboardingState(state, {
      connections: {
        [provider]: {
          connected: details.connected,
          accountId: details.accountId ?? null,
          accounts: details.accounts,
          lastSyncedAt:
            details.lastSyncedAt !== undefined ? details.lastSyncedAt : new Date().toISOString(),
        },
      },
    })
  );
}

export async function setActiveBrand(brandId: string): Promise<OnboardingState> {
  const context = await loadOnboardingContext(brandId);
  const targetState = context.metadata.brands[brandId];
  if (!targetState) {
    throw new Error("Brand not found");
  }

  if (context.metadata.activeBrandId === brandId) {
    return targetState;
  }

  await deactivateActiveBrand(context.supabase, context.user.id, brandId);
  await upsertActiveBrand(context.supabase, context.user.id, brandId, targetState);

  context.metadata.activeBrandId = brandId;
  await updateUserOnboardingMetadata(context.supabase, brandId);

  return targetState;
}

export async function createBrandProfile(
  name?: string
): Promise<{ brandId: string; state: OnboardingState }> {
  const { supabase, owner, metadata, user } = await loadOnboardingContext();
  const brandId = createBrandId();
  const state = createDefaultOnboardingState(owner);
  if (name) {
    state.brand.name = name;
  }
  metadata.brands[brandId] = state;
  metadata.activeBrandId = brandId;
  await persistMetadata(supabase, user, metadata);
  await ensureBrandProfileRecord(supabase, brandId, owner, state);
  return { brandId, state };
}

export async function deleteBrandFromMetadata(
  brandId: string
): Promise<{ nextActiveBrandId: string | null }> {
  const { supabase, user } = await getAuthContext();
  const metadata = await fetchMetadataFromTable(supabase, user.id);

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
    .eq("user_id", user.id)
    .eq("brand_id", brandId);

  if (deleteStateError) {
    throw deleteStateError;
  }

  await persistMetadata(supabase, user, metadata);

  return { nextActiveBrandId: metadata.activeBrandId ?? null };
}

export async function renameBrandProfile(
  brandId: string,
  name: string
): Promise<OnboardingState> {
  return updateBrandState(brandId, state =>
    mergeOnboardingState(state, {
      brand: { name },
    })
  );
}

export async function removeMemberFromBrand(
  brandId: string,
  email: string
): Promise<OnboardingState> {
  return updateBrandState(brandId, state => {
    const target = state.members.find(member => member.email === email);
    if (!target) {
      return state;
    }
    if (target.role === "owner") {
      throw new Error("Owners cannot be removed");
    }
    const members = state.members.filter(member => member.email !== email);
    return mergeOnboardingState(state, { members });
  });
}

export async function createMagicLinkInvite(
  brandId: string,
  email: string,
  role: BrandRole,
  siteUrl: string
): Promise<{ link: string; state: OnboardingState }> {
  if (!BRAND_ROLES.includes(role)) {
    throw new Error("Invalid role");
  }

  let generatedToken = "";
  const state = await updateBrandState(brandId, current => {
    const now = new Date().toISOString();
    generatedToken = `${createBrandId()}${createBrandId()}`;
    const invite: BrandInvite = {
      id: createBrandId(),
      email,
      role,
      token: generatedToken,
      createdAt: now,
      expiresAt: null,
    };
    const invites = [...current.invites.filter(item => item.email !== email), invite];
    return mergeOnboardingState(current, { invites });
  });

  const link = `${siteUrl.replace(/\/$/, "")}/invite?token=${generatedToken}&brand=${brandId}`;
  return { link, state };
}

export async function revokeInvite(
  brandId: string,
  inviteId: string
): Promise<OnboardingState> {
  return updateBrandState(brandId, state => {
    const invites = state.invites.filter(invite => invite.id !== inviteId);
    return mergeOnboardingState(state, { invites });
  });
}
