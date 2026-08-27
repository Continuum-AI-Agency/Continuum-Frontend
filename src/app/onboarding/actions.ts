'use server';

import { randomUUID } from 'node:crypto';
import { documentCategorySchema, documentRenameSchema } from '@continuum/contracts';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { PLATFORM_KEYS, type PlatformKey } from '@/components/onboarding/platforms';
import { getClaimsIdentity } from '@/lib/auth/claims';
import { mapIntegrationTypeToPlatformKey } from '@/lib/integrations/platform';
import { log } from '@/lib/observability/logger';
import {
  approveOnboardingBrandProfile,
  type IntegrationProvider,
} from '@/lib/onboarding/agentClient';
import { mapOnboardingStateToAgentPayload } from '@/lib/onboarding/mapping';
import type {
  OnboardingConnectionAccount,
  OnboardingDocument,
  OnboardingPatch,
  OnboardingState,
} from '@/lib/onboarding/state';
import { createBrandId } from '@/lib/onboarding/state';
import {
  appendDocument,
  applyOnboardingPatch,
  archiveDocument,
  deleteDocumentPermanently,
  fetchOnboardingState,
  renameDocument,
  resetOnboardingState,
  restoreDocument,
  saveDocumentPermanently,
  updateDocumentCategory,
} from '@/lib/onboarding/storage';
import { getPostHogClient } from '@/lib/posthog-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const getIntegrationServer = async () => {
  return import('@/lib/api/integrations/server');
};

const PLATFORM_KEY_TO_PROVIDER: Record<string, IntegrationProvider> = {
  youtube: 'youtube',
  googleAds: 'google-ads',
  dv360: 'google-ads',
  googleAnalytics: 'google-ads',
  instagram: 'meta',
  facebook: 'meta',
  threads: 'meta',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function fetchAssignedIntegrationContext(
  supabase: SupabaseServerClient,
  brandId: string,
): Promise<{ accountIds: string[]; providers: IntegrationProvider[] }> {
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .select('integration_account_id, integration_accounts_assets:integration_account_id(type)')
    .eq('brand_profile_id', brandId);

  if (error) {
    log.warn('[approveAndLaunchOnboardingAction] BPIA fetch failed', { error: String(error) });
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
  patch: OnboardingPatch,
): Promise<OnboardingState> {
  return applyOnboardingPatch(brandId, patch);
}

export async function resetOnboardingStateAction(brandId: string): Promise<OnboardingState> {
  return resetOnboardingState(brandId);
}

export async function completeOnboardingAction(brandId: string): Promise<OnboardingState> {
  const user = await getClaimsIdentity();
  const state = await applyOnboardingPatch(brandId, {
    completedAt: new Date().toISOString(),
    // The last screen. Bumped with the wizard when the product-catalog step landed —
    // completing at anything short of the final index resumes a completed brand onto a
    // screen it already finished.
    step: 7,
  });

  // Completion analytics are emitted only after the durable completion write.
  // A failed persistence attempt must never be counted as a completed onboarding.
  if (user?.id) {
    const integrationCount = Object.values(state.connections ?? {}).reduce(
      (count, connection) =>
        count + connection.accounts.filter((account) => account.selected).length,
      0,
    );
    after(async () => {
      const posthog = getPostHogClient();
      try {
        posthog.capture({
          distinctId: user.id,
          event: 'onboarding_completed',
          properties: {
            brand_id: brandId,
            integration_count: integrationCount,
          },
        });
      } finally {
        await posthog.shutdown();
      }
    });
  }

  // Warm the dashboard caches the first-value report reads, so the email that the
  // completedAt trigger just enqueued has full data and the dashboard the user is
  // about to open is already warm. Fire-and-forget; the report worker also warms
  // defensively on its first attempt.
  after(async () => {
    try {
      const { warmBrandNowServer } = await import('@/lib/api/warmBrand.server');
      await warmBrandNowServer(brandId);
    } catch (error) {
      log.error('[completeOnboardingAction] brand warm failed', error, { brandId });
    }
  });

  revalidatePath('/', 'layout');
  return state;
}

// Approves the brand profile and kicks the background strategic analysis WITHOUT
// marking onboarding complete. Used when leaving Brand DNA so competitor analysis
// is computing while the user moves through the inspirations + generation finale.
// approveAndLaunchOnboardingAction = this + completeOnboardingAction (classic flow).
export async function approveOnboardingAndStartAnalysisAction(
  brandId: string,
  options?: { idempotencyKey?: string },
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const user = await getClaimsIdentity();
  const userId = user?.id;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!userId || !session?.access_token) {
    throw new Error('User session not found');
  }

  const state = await fetchOnboardingState(brandId);
  const payload = mapOnboardingStateToAgentPayload(brandId, userId, state);

  const assignedFromBpia = await fetchAssignedIntegrationContext(supabase, brandId);
  if (assignedFromBpia.accountIds.length > 0) {
    payload.runContext.integration_account_ids = assignedFromBpia.accountIds;
    payload.runContext.integrated_platforms = Array.from(
      new Set([...payload.runContext.integrated_platforms, ...assignedFromBpia.providers]),
    );
  }

  const approved = await approveOnboardingBrandProfile({
    payload,
    idempotencyKey: options?.idempotencyKey,
    accessToken: session.access_token,
  });
  console.info('[approveOnboardingAndStartAnalysisAction] Brand profile approved', {
    brandId,
    agentBrandProfileId: approved.brand_profile.id,
  });

  const readinessScore = state.brand.readiness?.overall_score ?? null;
  const readinessFindings = state.brand.readiness?.findings ?? null;
  after(async () => {
    try {
      const { runStrategicAnalysisServer } = await import('@/lib/api/strategicAnalyses.server');
      const analysisAck = await runStrategicAnalysisServer({
        brandId,
        readinessScore,
        readinessFindings,
      });
      console.info('[approveOnboardingAndStartAnalysisAction] Strategic analysis triggered', {
        brandId,
        runId: analysisAck.runId,
        taskId: analysisAck.taskId,
        status: analysisAck.status,
      });
    } catch (error) {
      log.error(
        '[approveOnboardingAndStartAnalysisAction] Strategic analysis kickoff failed',
        error,
        {
          brandId,
        },
      );
    }
  });

  // Approval synchronizes the canonical brand report. Trends starts only after
  // that durable boundary; the Backend will hold it until the matching strategic
  // analysis is complete.
  after(async () => {
    try {
      const { startBrandInsightsServer } = await import('@/lib/api/brandInsights.server');
      await startBrandInsightsServer(brandId);
    } catch (error) {
      log.error('[approveOnboardingAndStartAnalysisAction] trends kickoff failed', error, {
        brandId,
      });
    }
  });

  if (process.env.NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED !== 'false') {
    after(async () => {
      try {
        const { warmOnboardingCompetitorsServer } = await import(
          '@/lib/api/onboardingInspirations.server'
        );
        await warmOnboardingCompetitorsServer(brandId);
      } catch (error) {
        log.error('[approveOnboardingAndStartAnalysisAction] competitor warm failed', error, {
          brandId,
        });
      }
    });
  }

  // Persist the deterministic brand kit (colors/typography columns + logo +
  // brand-kit.json) so generation and other features can map to it by brandId.
  after(async () => {
    try {
      const { persistBrandKitServer } = await import('@/lib/api/onboardingInspirations.server');
      await persistBrandKitServer({
        brandId,
        colors: state.brand.colors ?? [],
        typography: state.brand.typography ?? { primary: null, secondary: null },
        logoPath: state.brand.logoPath ?? null,
      });
    } catch (error) {
      log.error('[approveOnboardingAndStartAnalysisAction] brand kit persist failed', error, {
        brandId,
      });
    }
  });
}

export async function approveAndLaunchOnboardingAction(
  brandId: string,
  options?: { idempotencyKey?: string },
): Promise<OnboardingState> {
  await approveOnboardingAndStartAnalysisAction(brandId, options);
  return completeOnboardingAction(brandId);
}

export async function registerDocumentMetadataAction(
  brandId: string,
  document: Omit<OnboardingDocument, 'id' | 'createdAt' | 'status'> & {
    id?: string;
    status?: OnboardingDocument['status'];
  },
): Promise<OnboardingState> {
  const payload: OnboardingDocument = {
    id: document.id ?? randomUUID(),
    name: document.name,
    source: document.source,
    createdAt: new Date().toISOString(),
    status: document.status ?? 'ready',
    size: document.size,
    externalUrl: document.externalUrl,
  };

  return appendDocument(brandId, payload);
}

/**
 * Take a document down (reversible). The sweep purges its chunks and, after the
 * recovery window, its storage object.
 */
export async function archiveDocumentAction(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  return archiveDocument(brandId, documentId);
}

export async function restoreDocumentAction(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  return restoreDocument(brandId, documentId);
}

/** Irreversible. Offered only from the Archived view. */
export async function deleteDocumentPermanentlyAction(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  return deleteDocumentPermanently(brandId, documentId);
}

export async function renameDocumentAction(
  brandId: string,
  documentId: string,
  displayName: string,
): Promise<OnboardingState> {
  // Re-parsed server-side against the same schema the client form resolver uses, so
  // the two can never drift and the client gate is never the only gate.
  const parsed = documentRenameSchema.safeParse({ displayName });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid document name');
  }
  return renameDocument(brandId, documentId, parsed.data.displayName);
}

/** Promote a one-off chat/MCP upload to permanent brand knowledge. */
export async function saveDocumentPermanentlyAction(
  brandId: string,
  documentId: string,
): Promise<OnboardingState> {
  return saveDocumentPermanently(brandId, documentId);
}

export async function updateDocumentCategoryAction(
  brandId: string,
  documentId: string,
  category: string,
): Promise<OnboardingState> {
  const parsed = documentCategorySchema.safeParse(category);
  if (!parsed.success) {
    throw new Error(`Invalid document category: ${category}`);
  }
  return updateDocumentCategory(brandId, documentId, parsed.data);
}

export async function enqueueDocumentEmbedAction(
  brandId: string,
  input: {
    name: string;
    source: OnboardingDocument['source'];
    externalUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileName?: string;
    size?: number;
  },
): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  const documentId = createBrandId();

  type EmbedInvokeResult = { jobId?: string };

  const { data: invokeData } = await supabase.functions.invoke<EmbedInvokeResult>(
    'embed_document',
    {
      body: {
        brandId,
        documentId,
        source: input.source,
        storagePath: input.storagePath,
        externalUrl: input.externalUrl,
        mimeType: input.mimeType,
        fileName: input.fileName ?? input.name,
      },
    },
  );

  const document: OnboardingDocument = {
    id: documentId,
    name: input.name,
    source: input.source,
    createdAt: new Date().toISOString(),
    status: 'processing',
    size: input.size,
    externalUrl: input.externalUrl,
    storagePath: input.storagePath,
    jobId: typeof invokeData?.jobId === 'string' ? invokeData.jobId : undefined,
  };

  return appendDocument(brandId, document);
}

type IntegrationGroup = 'google' | 'meta';

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
    'youtube' | 'googleAds' | 'dv360' | 'googleAnalytics' | 'instagram' | 'facebook' | 'threads',
    EdgeAccount[]
  >;
};

export async function syncIntegrationAccountsAction(
  brandId: string,
  groups: IntegrationGroup[],
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
  } catch {}
  const { data, error } = await supabase.functions.invoke('integration_accounts', {
    body: { groups },
    headers: authHeader,
  });
  if (error) {
    const contextBody =
      typeof (error as { context?: { body?: unknown } })?.context?.body === 'string'
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
    log.error('[syncIntegrationAccountsAction] integration_accounts invoke failed', error, {
      status: (error as { status?: number })?.status,
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
    .map((account) => account.id)
    .filter(Boolean);

  let selectionById = new Map<string, boolean>();
  if (allAccountIds.length > 0) {
    const { data: selectionRows } = await supabase
      .schema('brand_profiles')
      .from('integration_accounts_assets')
      .select('id, raw_payload')
      .in('id', allAccountIds);

    selectionById = new Map(
      (selectionRows ?? [])
        .map((row) => {
          const hasSelectedKey =
            row?.raw_payload &&
            typeof row.raw_payload === 'object' &&
            Object.hasOwn(row.raw_payload, 'selected');
          if (!hasSelectedKey) return null;
          const selected = (row.raw_payload as Record<string, unknown>).selected === true;
          return [row.id, selected] as const;
        })
        .filter((entry): entry is readonly [string, boolean] => Boolean(entry)),
    );
  }

  const platformKeys = [
    'youtube',
    'googleAds',
    'dv360',
    'googleAnalytics',
    'instagram',
    'facebook',
    'threads',
  ] as const;

  const connectionsPatch: Partial<OnboardingPatch['connections']> = {};

  for (const key of platformKeys) {
    const accounts = payload?.accountsByPlatform?.[key] ?? [];
    if (!accounts.length) continue;
    const mapped: OnboardingConnectionAccount[] = accounts.map((a) => ({
      id: a.id,
      name: a.name ?? a.externalAccountId ?? 'Account',
      status:
        a.status === 'pending' || a.status === 'error'
          ? (a.status as 'pending' | 'error')
          : 'active',
      selected: selectionById.has(a.id) ? selectionById.get(a.id) === true : undefined,
    }));

    const hasExplicitSelection =
      mapped.some((account) => account.selected === true) ||
      mapped.some((account) => account.selected === false);
    const defaultAccountId = hasExplicitSelection
      ? (mapped.find((account) => account.selected)?.id ?? null)
      : (mapped[0]?.id ?? null);

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
  allIntegrationAccountIds?: string[],
): Promise<OnboardingState> {
  const idsToUpdate =
    allIntegrationAccountIds && allIntegrationAccountIds.length > 0
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
  const connectionsPatch: Partial<OnboardingPatch['connections']> = {};

  PLATFORM_KEYS.forEach((key) => {
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
