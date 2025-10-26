import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  parseOnboardingMetadata,
} from "./state";
import type { PlatformKey } from "@/components/onboarding/platforms";

type AuthContext = {
  supabase: SupabaseClient;
  user: User;
  owner: BrandMember;
};

type OnboardingContext = {
  metadata: OnboardingMetadata;
  state: OnboardingState;
  brandId: string;
  owner: BrandMember;
  supabase: SupabaseClient;
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
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user, owner: getOwnerMember(user) };
}

async function saveMetadata(
  supabase: SupabaseClient,
  metadata: OnboardingMetadata
): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { onboarding: metadata },
  });
  if (error) {
    throw error;
  }
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
  let metadata = parseOnboardingMetadata(user.user_metadata?.onboarding);

  if (!metadata.activeBrandId && Object.keys(metadata.brands).length === 0) {
    const initialBrandId = createBrandId();
    metadata = createDefaultMetadata(initialBrandId, owner);
    await saveMetadata(supabase, metadata);
  }

  const { metadata: normalizedMetadata, brandId, dirty } = ensureActiveBrand(
    metadata,
    owner,
    requestedBrandId
  );

  if (dirty) {
    await saveMetadata(supabase, normalizedMetadata);
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
  await saveMetadata(context.supabase, context.metadata);
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
  if (context.metadata.activeBrandId !== brandId) {
    context.metadata.activeBrandId = brandId;
    await saveMetadata(context.supabase, context.metadata);
  }
  return context.metadata.brands[brandId];
}

export async function createBrandProfile(
  name?: string
): Promise<{ brandId: string; state: OnboardingState }> {
  const { supabase, owner, metadata } = await loadOnboardingContext();
  const brandId = createBrandId();
  const state = createDefaultOnboardingState(owner);
  if (name) {
    state.brand.name = name;
  }
  metadata.brands[brandId] = state;
  metadata.activeBrandId = brandId;
  await saveMetadata(supabase, metadata);
  return { brandId, state };
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

  let generatedToken: string = "";
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
