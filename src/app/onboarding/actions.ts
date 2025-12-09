"use server";

import { randomUUID } from "node:crypto";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import {
  appendDocument,
  applyOnboardingPatch,
  fetchOnboardingState,
  removeDocument,
  resetOnboardingState,
  updateConnectionAccounts,
} from "@/lib/onboarding/storage";
import type {
  OnboardingDocument,
  OnboardingPatch,
  OnboardingState,
  OnboardingConnectionAccount,
} from "@/lib/onboarding/state";
import { createBrandId } from "@/lib/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type IntegrationAccountAssetRow =
  Database["brand_profiles"]["Tables"]["integration_accounts_assets"]["Row"];

const MOCK_ACCOUNT_NAMES = [
  "Primary Brand Account",
  "Performance Ads Account",
  "Global Presence",
  "Creative Studio",
];

function createMockAccounts(accountId?: string | null): OnboardingConnectionAccount[] {
  const sourceId = accountId ?? randomUUID();
  return [
    {
      id: sourceId,
      name: MOCK_ACCOUNT_NAMES[Math.floor(Math.random() * MOCK_ACCOUNT_NAMES.length)],
      status: "active",
    },
  ];
}

export async function fetchOnboardingStateAction(brandId: string): Promise<OnboardingState> {
  return fetchOnboardingState(brandId);
}

export async function mutateOnboardingStateAction(
  brandId: string,
  patch: OnboardingPatch
): Promise<OnboardingState> {
  return applyOnboardingPatch(brandId, patch);
}

export async function resetOnboardingStateAction(brandId: string): Promise<OnboardingState> {
  return resetOnboardingState(brandId);
}

export async function markPlatformConnectionAction(props: {
  brandId: string;
  key: PlatformKey;
  accountId?: string | null;
}): Promise<OnboardingState> {
  const accounts = createMockAccounts(props.accountId);
  return updateConnectionAccounts(props.brandId, props.key, {
    connected: true,
    accountId: accounts[0]?.id ?? props.accountId ?? null,
    accounts,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function refreshPlatformConnectionAction(
  brandId: string,
  provider: PlatformKey
): Promise<OnboardingState> {
  const accounts = createMockAccounts();
  return updateConnectionAccounts(brandId, provider, {
    connected: true,
    accountId: accounts[0]?.id ?? null,
    accounts,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function clearPlatformConnectionAction(
  brandId: string,
  key: PlatformKey
): Promise<OnboardingState> {
  return updateConnectionAccounts(brandId, key, {
    connected: false,
    accountId: null,
    accounts: [],
    lastSyncedAt: null,
  });
}

export async function completeOnboardingAction(brandId: string): Promise<OnboardingState> {
  return applyOnboardingPatch(brandId, {
    completedAt: new Date().toISOString(),
    step: 2,
  });
}

export async function registerDocumentMetadataAction(
  brandId: string,
  document: Omit<OnboardingDocument, "id" | "createdAt" | "status"> & {
  id?: string;
  status?: OnboardingDocument["status"];
}): Promise<OnboardingState> {
  const payload: OnboardingDocument = {
    id: document.id ?? randomUUID(),
    name: document.name,
    source: document.source,
    createdAt: new Date().toISOString(),
    status: document.status ?? "ready",
    size: document.size,
    externalUrl: document.externalUrl,
  };

  return appendDocument(brandId, payload);
}

export async function removeDocumentAction(
  brandId: string,
  documentId: string
): Promise<OnboardingState> {
  return removeDocument(brandId, documentId);
}

export async function enqueueDocumentEmbedAction(
  brandId: string,
  input: {
    name: string;
    source: OnboardingDocument["source"];
    externalUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileName?: string;
    size?: number;
  }
): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  const documentId = createBrandId();

  type EmbedInvokeResult = { jobId?: string };

  const { data: invokeData } = await supabase.functions.invoke<EmbedInvokeResult>("embed_document", {
    body: {
      brandId,
      documentId,
      source: input.source,
      storagePath: input.storagePath,
      externalUrl: input.externalUrl,
      mimeType: input.mimeType,
      fileName: input.fileName ?? input.name,
    },
  });

  const document: OnboardingDocument = {
    id: documentId,
    name: input.name,
    source: input.source,
    createdAt: new Date().toISOString(),
    status: "processing",
    size: input.size,
    externalUrl: input.externalUrl,
    storagePath: input.storagePath,
    jobId: typeof invokeData?.jobId === "string" ? invokeData.jobId : undefined,
  };

  return appendDocument(brandId, document);
}

// ---- New: Sync integration accounts via edge function ----
type IntegrationGroup = "google" | "meta";

type EdgeAccount = {
  id: string;
  externalAccountId: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
};

type AccountsByPlatformResponse = {
  syncedAt: string;
  accountsByPlatform: Record<
    "youtube" | "googleAds" | "dv360" | "instagram" | "facebook" | "threads",
    EdgeAccount[]
  >;
};

export async function syncIntegrationAccountsAction(
  brandId: string,
  groups: IntegrationGroup[]
): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  // Ensure the user's JWT is forwarded to the Edge Function for RLS
  let authHeader: Record<string, string> | undefined;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // ignore; we'll call without explicit header
  }
  const { data, error } = await supabase.functions.invoke("integration_accounts", {
    body: { groups },
    headers: authHeader,
  });
  if (error) {
    const contextBody =
      typeof (error as { context?: { body?: unknown } })?.context?.body === "string"
        ? (error as { context: { body: string } }).context.body
        : undefined;
    let parsedBody: unknown;
    if (contextBody) {
      try {
        parsedBody = JSON.parse(contextBody);
      } catch {
        parsedBody = contextBody;
      }
    }
    console.error("[syncIntegrationAccountsAction] integration_accounts invoke failed", {
      status: (error as { status?: number })?.status,
      message: error.message,
      body: parsedBody,
      groups,
      authHeaderProvided: Boolean(authHeader?.Authorization),
    });
    // Fall back to current state if invoke fails
    return fetchOnboardingState(brandId);
  }
  const payload = data as AccountsByPlatformResponse;
  const now = payload?.syncedAt ?? new Date().toISOString();

  const allAccountIds = Object.values(payload?.accountsByPlatform ?? {})
    .flat()
    .map(account => account.id)
    .filter(Boolean);

  let selectionById = new Map<string, boolean>();
  if (allAccountIds.length > 0) {
    const { data: selectionRows } = await supabase
      .schema("brand_profiles")
      .from("integration_accounts_assets")
      .select("id, raw_payload")
      .in("id", allAccountIds);

    selectionById = new Map(
      (selectionRows ?? [])
        .map(row => {
          const hasSelectedKey =
            row?.raw_payload &&
            typeof row.raw_payload === "object" &&
            Object.prototype.hasOwnProperty.call(row.raw_payload, "selected");
          if (!hasSelectedKey) return null;
          const selected =
            (row.raw_payload as Record<string, unknown>).selected === true;
          return [row.id, selected] as const;
        })
        .filter((entry): entry is readonly [string, boolean] => Boolean(entry))
    );
  }

  const platformKeys = [
    "youtube",
    "googleAds",
    "dv360",
    "instagram",
    "facebook",
    "threads",
  ] as const;

  const connectionsPatch: Partial<OnboardingPatch["connections"]> = {};

  for (const key of platformKeys) {
    const accounts = payload?.accountsByPlatform?.[key] ?? [];
    if (!accounts.length) continue;
    const mapped: OnboardingConnectionAccount[] = accounts.map((a) => ({
      id: a.id,
      name: a.name ?? a.externalAccountId ?? "Account",
      status: (a.status === "pending" || a.status === "error") ? (a.status as "pending" | "error") : "active",
      selected: selectionById.has(a.id) ? selectionById.get(a.id) === true : undefined,
    }));

    const hasExplicitSelection =
      mapped.some(account => account.selected === true) || mapped.some(account => account.selected === false);
    const defaultAccountId = hasExplicitSelection
      ? mapped.find(account => account.selected)?.id ?? null
      : mapped[0]?.id ?? null;

    connectionsPatch[key as PlatformKey] = {
      connected: true,
      accountId: defaultAccountId,
      accounts: mapped,
      lastSyncedAt: now,
    };
  }

  if (Object.keys(connectionsPatch).length === 0) {
    // Nothing to update; return current state
    return fetchOnboardingState(brandId);
  }

  return applyOnboardingPatch(brandId, {
    connections: connectionsPatch,
  });
}

// ---- New: Associate selected accounts to brand profile ----
export async function associateIntegrationAccountsAction(
  brandId: string,
  integrationAccountIds: string[],
  allIntegrationAccountIds?: string[]
): Promise<OnboardingState> {
  const idsToUpdate = (allIntegrationAccountIds && allIntegrationAccountIds.length > 0)
    ? allIntegrationAccountIds
    : integrationAccountIds;

  if (!idsToUpdate?.length) {
    return fetchOnboardingState(brandId);
  }
  const supabase = await createSupabaseServerClient();

  // Read current payloads to preserve any existing metadata
  const { data: rows } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, raw_payload")
    .in("id", idsToUpdate);

  type MinimalAssetRow = Pick<IntegrationAccountAssetRow, "id" | "raw_payload">;
  const updates = (rows ?? []).map((row: MinimalAssetRow) => {
    const selected = integrationAccountIds.includes(row.id);
    const merged =
      row?.raw_payload && typeof row.raw_payload === "object"
        ? { ...row.raw_payload, selected }
        : { selected };
    return { id: row.id, raw_payload: merged, updated_at: new Date().toISOString() };
  });

  // Apply updates per row (ensures we don't overwrite raw_payload blindly)
  await Promise.all(
    updates.map(update =>
      supabase
        .schema("brand_profiles")
        .from("integration_accounts_assets")
        .update(update)
        .eq("id", update.id)
    )
  );

  // Persist selection flags into onboarding state so reloads stay in sync
  const selectionSet = new Set(integrationAccountIds);
  const state = await fetchOnboardingState(brandId);
  const connectionsPatch: Partial<OnboardingPatch["connections"]> = {};

  PLATFORM_KEYS.forEach(key => {
    const connection = state.connections[key];
    if (!connection) return;
    const accounts = (connection.accounts ?? []).map(account => {
      const explicitlyKnown = allIntegrationAccountIds?.includes(account.id) ?? false;
      const selected = selectionSet.has(account.id)
        ? true
        : explicitlyKnown
          ? false
          : account.selected;
      return { ...account, selected };
    });
    connectionsPatch[key] = {
      connected: connection.connected,
      accountId: connection.accountId,
      accounts,
      lastSyncedAt: connection.lastSyncedAt,
    };
  });

  const next = await applyOnboardingPatch(brandId, {
    connections: connectionsPatch,
  });

  return next;
}
