'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  buildBillingManagementModel,
  createBillingApiClient,
  decideBillingAccess,
  ForbiddenBillingState,
  redirectToStripeUrl,
  type BillingCatalogItemView,
  type BillingManagementModel,
  type BillingStripeAccountView,
  type BillingSummaryView,
} from '@continuum/billing-ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { BillingSettingsView } from './billing/BillingSettingsView';
import {
  buildCheckoutReturnUrls,
  parseCheckoutReturnStatus,
  sleep,
  stripCheckoutReturnParams,
} from './billing/checkoutReturn';

type BrandBillingPanelProps = {
  brandId: string;
  role: string | null;
  tier: number;
  brandName?: string | null;
  selfEmail?: string | null;
};

const SUCCESS_POLL_ATTEMPTS = 4;
const SUCCESS_POLL_DELAY_MS = 1500;

function billingApiBaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for billing-api edge');
  }
  return `${supabaseUrl}/functions/v1/billing-api`;
}

function asSummary(body: Record<string, unknown>): BillingSummaryView {
  const entitlements = body.entitlements as BillingSummaryView['entitlements'] | undefined;
  const storage = body.storage as BillingSummaryView['storage'] | undefined;
  const canvasUsage = body.canvasUsage as BillingSummaryView['canvasUsage'] | undefined;
  if (!entitlements || !storage || !canvasUsage) {
    throw new Error('billing summary response missing entitlements, storage, or canvasUsage');
  }
  return {
    entitlements: {
      brandId: String(entitlements.brandId),
      tier: Number(entitlements.tier),
      tierMode: String(entitlements.tierMode),
      access: entitlements.access,
      libraryCapacityBytes: Number(entitlements.libraryCapacityBytes),
      canvasCredits: entitlements.canvasCredits,
      features: entitlements.features,
      intelligenceProviders: entitlements.intelligenceProviders,
    },
    storage: {
      usedBytes: Number(storage.usedBytes),
      capacityBytes: Number(storage.capacityBytes),
      availableBytes: Number(storage.availableBytes),
      utilizationPercent: Number(storage.utilizationPercent),
    },
    canvasUsage: {
      health: String(canvasUsage.health),
      creditsSpent7Days: Number(canvasUsage.creditsSpent7Days),
      creditsSpent30Days: Number(canvasUsage.creditsSpent30Days),
      lastSpendAt: canvasUsage.lastSpendAt ?? null,
    },
  };
}

function asCatalogItems(items: unknown): BillingCatalogItemView[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.code !== 'string' || typeof row.displayName !== 'string') return [];
    return [
      {
        code: row.code,
        displayName: row.displayName,
        kind: typeof row.kind === 'string' ? row.kind : 'access',
        availability: typeof row.availability === 'string' ? row.availability : 'available',
        dependencyCodes: Array.isArray(row.dependencyCodes)
          ? row.dependencyCodes.filter((c): c is string => typeof c === 'string')
          : undefined,
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : undefined,
      },
    ];
  });
}

function asStripeAccount(value: unknown): BillingStripeAccountView | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as BillingStripeAccountView;
  if (typeof row.brandId !== 'string') return null;
  return row;
}

function modelFromOverview(
  brandId: string,
  payload: {
    summary: Record<string, unknown>;
    catalog?: { version?: string; items?: unknown[] };
    stripeAccount: unknown;
  },
): BillingManagementModel {
  return buildBillingManagementModel({
    brandId,
    summary: asSummary(payload.summary),
    catalogItems: asCatalogItems(payload.catalog?.items),
    catalogVersion: payload.catalog?.version,
    stripeAccount: asStripeAccount(payload.stripeAccount),
  });
}

export function BrandBillingPanel({
  brandId,
  role,
  tier,
  brandName = null,
  selfEmail = null,
}: BrandBillingPanelProps) {
  const access = useMemo(() => decideBillingAccess(role), [role]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const [model, setModel] = useState<BillingManagementModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'portal' | 'checkout' | null>(null);
  const [loading, setLoading] = useState(access.canManageBilling);
  const checkoutReturnHandled = useRef(false);

  const client = useMemo(() => {
    if (!access.canManageBilling) return null;
    return createBillingApiClient({
      baseUrl: billingApiBaseUrl(),
      getAccessToken: async () => {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) throw new Error('Sign in required to manage billing');
        return token;
      },
    });
  }, [access.canManageBilling]);

  const fetchOverviewModel = useCallback(async (): Promise<BillingManagementModel> => {
    if (!client) throw new Error('Billing client unavailable');
    const payload = await client.getOverview(brandId);
    return modelFromOverview(brandId, payload);
  }, [brandId, client]);

  const reload = useCallback(
    async (options?: { soft?: boolean }) => {
      if (!client) return null;
      const soft = options?.soft === true;
      if (!soft) {
        setLoading(true);
      }
      setLoadError(null);
      try {
        const next = await fetchOverviewModel();
        setModel(next);
        return next;
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load billing');
        if (!soft) setModel(null);
        return null;
      } finally {
        if (!soft) setLoading(false);
      }
    },
    [client, fetchOverviewModel],
  );

  const clearCheckoutReturnQuery = useCallback(() => {
    const next = stripCheckoutReturnParams(new URLSearchParams(searchParams?.toString() ?? ''));
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Stripe Checkout return: toast, soft-refresh (poll for webhook lag), strip flags.
  useEffect(() => {
    if (!access.canManageBilling || !client) return;
    if (checkoutReturnHandled.current) return;

    const status = parseCheckoutReturnStatus(searchParams ?? new URLSearchParams());
    if (!status) return;
    checkoutReturnHandled.current = true;

    const sessionId = searchParams?.get('session_id') ?? null;

    if (status === 'cancel') {
      show({
        title: 'Checkout canceled',
        description: 'No payment was made. You can subscribe again anytime.',
        variant: 'info',
        durationMs: 5000,
        dedupeKey: 'billing-checkout-cancel',
      });
      clearCheckoutReturnQuery();
      void reload({ soft: true });
      return;
    }

    show({
      title: 'Payment received',
      description: sessionId
        ? 'Unlocking modules and credits. This usually takes a few seconds.'
        : 'Unlocking modules and credits from Stripe…',
      variant: 'success',
      durationMs: 6000,
      dedupeKey: 'billing-checkout-success',
    });

    let cancelled = false;

    const run = async () => {
      // Soft reloads avoid full-page skeleton while webhook applies grants.
      for (let attempt = 0; attempt < SUCCESS_POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) return;
        await reload({ soft: true });
        if (attempt < SUCCESS_POLL_ATTEMPTS - 1) {
          await sleep(SUCCESS_POLL_DELAY_MS);
        }
      }
      if (!cancelled) {
        show({
          title: 'Billing updated',
          description:
            'If a module still shows Off, wait a moment and refresh — webhook grants can lag slightly.',
          variant: 'info',
          durationMs: 5000,
          dedupeKey: 'billing-checkout-refreshed',
        });
        clearCheckoutReturnQuery();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    access.canManageBilling,
    clearCheckoutReturnQuery,
    client,
    reload,
    searchParams,
    show,
  ]);

  if (access.tabVisibility === 'hidden') {
    return (
      <ForbiddenBillingState
        title="Billing is not available"
        body="You do not have access to billing for this workspace."
      />
    );
  }

  if (access.tabVisibility === 'locked') {
    return (
      <ForbiddenBillingState
        title="Billing is managed by the brand owner"
        body="Only the brand owner can change payment methods, modules, and invoices for this workspace."
      />
    );
  }

  if (loading && !model) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading billing">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <p className="text-sm text-muted-foreground">Loading billing for tier {tier}…</p>
      </div>
    );
  }

  if (loadError && !model) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4">
        <p className="text-sm font-medium text-destructive">Could not load billing</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!model || !client) return null;

  return (
    <BillingSettingsView
      model={model}
      busy={busy}
      error={actionError}
      brandName={brandName}
      selfEmail={selfEmail}
      actions={{
        openCustomerPortal: async () => {
          setBusy('portal');
          setActionError(null);
          try {
            const result = await client.openPortal(brandId, window.location.href);
            if (!result.url) throw new Error('Portal session missing url');
            redirectToStripeUrl(result.url);
          } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to open portal');
            setBusy(null);
          }
        },
        startCheckout: async (codes) => {
          setBusy('checkout');
          setActionError(null);
          try {
            const { successUrl, cancelUrl } = buildCheckoutReturnUrls({
              origin: window.location.origin,
              pathname: window.location.pathname,
              search: window.location.search,
            });
            const result = await client.startCheckout(brandId, {
              codes,
              successUrl,
              cancelUrl,
              customerEmail: selfEmail ?? undefined,
            });
            if (!result.url) throw new Error('Checkout session missing url');
            redirectToStripeUrl(result.url);
          } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to start checkout');
            setBusy(null);
          }
        },
      }}
    />
  );
}
