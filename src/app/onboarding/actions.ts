"use server";

import { randomUUID } from "node:crypto";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import {
  appendDocument,
  applyOnboardingPatch,
  fetchOnboardingState,
  removeDocument,
  resetOnboardingState,
} from "@/lib/onboarding/storage";
import type {
  OnboardingDocument,
  OnboardingPatch,
  OnboardingState,
  OnboardingConnectionAccount,
} from "@/lib/onboarding/state";
import { createBrandId } from "@/lib/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapOnboardingStateToAgentPayload } from "@/lib/onboarding/mapping";
import { approveOnboardingBrandProfile, type IntegrationProvider } from "@/lib/onboarding/agentClient";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getPostHogClient } from "@/lib/posthog-server";


const getIntegrationServer = async () => {
  return import("@/lib/api/integrations/server");
};

const PLATFORM_KEY_TO_PROVIDER: Record<string, IntegrationProvider> = {
  youtube: "youtube",
  googleAds: "google-ads",
  dv360: "google-ads",
  instagram: "meta",
  facebook: "meta",
  threads: "meta",
  tiktok: "tiktok",
  linkedin: "linkedin",
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function fetchAssignedIntegrationContext(
  supabase: SupabaseServerClient,
  brandId: string
): Promise<{ accountIds: string[]; providers: IntegrationProvider[] }> {
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select("integration_account_id, integration_accounts_assets:integration_account_id(type)")
    .eq("brand_profile_id", brandId);

  if (error) {
    console.warn("[approveAndLaunchOnboardingAction] BPIA fetch failed", error);
    return { accountIds: [], providers: [] };
  }

  type BpiaRow = {
    integration_account_id: string;
    integration_accounts_assets?: { type: string | null } | { type: string | null }[] | null;
  };
  const rows = (data ?? []) as BpiaRow[];
  const accountIds: string[] = [];
  const providerSet = new Set<IntegrationProvider>();

  for (const row of rows) {
    if (!row.integration_account_id) continue;
    accountIds.push(row.integration_account_id);
    const asset = Array.isArray(row.integration_accounts_assets)
      ? row.integration_accounts_assets[0]
      : row.integration_accounts_assets;
    const platformKey = mapIntegrationTypeToPlatformKey(asset?.type ?? null);
    const provider = platformKey ? PLATFORM_KEY_TO_PROVIDER[platformKey] : null;
    if (provider) providerSet.add(provider);
  }

  return { accountIds, providers: Array.from(providerSet) };
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

export async function completeOnboardingAction(brandId: string): Promise<OnboardingState> {
  const state = await applyOnboardingPatch(brandId, {
    completedAt: new Date().toISOString(),
    step: 2,
  });
  
  revalidatePath("/", "layout");
  return state;
}

export async function approveAndLaunchOnboardingAction(
  brandId: string,
  options?: { idempotencyKey?: string }
): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) {
    throw new Error("User session not found");
  }

  const state = await fetchOnboardingState(brandId);
  const payload = mapOnboardingStateToAgentPayload(brandId, userId, state);

  const assignedFromBpia = await fetchAssignedIntegrationContext(supabase, brandId);
  if (assignedFromBpia.accountIds.length > 0) {
    payload.runContext.integration_account_ids = assignedFromBpia.accountIds;
    payload.runContext.integrated_platforms = Array.from(
      new Set([...payload.runContext.integrated_platforms, ...assignedFromBpia.providers])
    );
  }

  const approved = await approveOnboardingBrandProfile({
    payload,
    idempotencyKey: options?.idempotencyKey,
  });
  console.info("[approveAndLaunchOnboardingAction] Brand profile approved", {
    brandId,
    agentBrandProfileId: approved.brand_profile.id,
  });

  const readinessScore = state.brand.readiness?.overall_score ?? null;
  const readinessFindings = state.brand.readiness?.findings ?? null;
  after(async () => {
    try {
      const { runStrategicAnalysisServer } = await import("@/lib/api/strategicAnalyses.server");
      const analysisAck = await runStrategicAnalysisServer({
        brandId,
        readinessScore,
        readinessFindings,
      });
      console.info("[approveAndLaunchOnboardingAction] Strategic analysis triggered", {
        brandId,
        runId: analysisAck.runId,
        taskId: analysisAck.taskId,
        status: analysisAck.status,
      });
    } catch (error) {
      console.warn("[approveAndLaunchOnboardingAction] Strategic analysis kickoff failed", {
        brandId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userId,
    event: "onboarding_completed",
    properties: {
      brand_id: brandId,
      integration_count: payload.runContext.integration_account_ids.length,
    },
  });
  await posthog.shutdown();

  return completeOnboardingAction(brandId);
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
  let authHeader: Record<string, string> | undefined;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    
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
    return fetchOnboardingState(brandId);
  }

  return applyOnboardingPatch(brandId, {
    connections: connectionsPatch,
  });
}

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

  const { applyBrandProfileIntegrationAccountsServer } = await getIntegrationServer();
  await applyBrandProfileIntegrationAccountsServer({
    brandId,
    assetPks: integrationAccountIds,
  });

  const state = await fetchOnboardingState(brandId);
  const connectionsPatch: Partial<OnboardingPatch["connections"]> = {};

  PLATFORM_KEYS.forEach(key => {
    const connection = state.connections[key];
    if (!connection) return;
    const accounts = (connection.accounts ?? []).map((account: OnboardingConnectionAccount) => {
      const explicitlyKnown = allIntegrationAccountIds?.includes(account.id) ?? false;
      const selected = integrationAccountIds.includes(account.id)
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
