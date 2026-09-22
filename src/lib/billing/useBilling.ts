'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { BillingApiRequestError, fetchBillingOverview } from './billingApi';
import {
  CHANGE_POLL_INTERVAL_MS,
  CHANGE_POLL_WINDOW_MS,
  isChangeSettled,
  type PendingBillingChange,
  parseCheckoutReturn,
} from './billingViewModel';

export const billingOverviewKey = (brandId: string) => ['billing', 'overview', brandId] as const;

/** An absolute URL back to this settings page, for Stripe's success/cancel/return redirects. */
export function billingReturnUrl(query: string): string {
  return `${window.location.origin}${window.location.pathname}?${query}`;
}

function useBillingOverview(brandId: string, pollIntervalMs: number | false) {
  return useQuery({
    queryKey: billingOverviewKey(brandId),
    queryFn: () => fetchBillingOverview(brandId),
    staleTime: 30_000,
    refetchInterval: pollIntervalMs,
    // A 4xx (not the owner, contract-managed, bad request) will not change on retry.
    retry: (failureCount, error) =>
      failureCount < 1 &&
      !(error instanceof BillingApiRequestError && error.status !== null && error.status < 500),
  });
}

// One toast slot for the whole wait: the outcome replaces "Payment received" in place.
const PENDING_TOAST_KEY = 'billing-pending-change';

function settledTitle(change: PendingBillingChange): string {
  switch (change.kind) {
    case 'plan_added':
      return 'Your plan is active';
    case 'plan_removed':
      return 'Plan removed';
    case 'credits_added':
      return 'Canvas credits added';
    case 'overage_changed':
      return change.enabled ? 'Auto-billing is on' : 'Auto-billing is off';
  }
}

/**
 * The brand's billing overview, plus any change Stripe has confirmed that our webhook may not
 * have applied yet — a Checkout return (?checkout=success|cancel) or a plan change made in the
 * panel. While one is pending the overview is polled until it shows, for at most
 * CHANGE_POLL_WINDOW_MS.
 */
export function useBillingOverviewWithPendingChange(brandId: string) {
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<PendingBillingChange | null>(null);
  const deadlineRef = useRef(0);
  const handledReturnRef = useRef(false);
  const overview = useBillingOverview(brandId, pending ? CHANGE_POLL_INTERVAL_MS : false);
  const data = overview.data;

  const track = useCallback((change: PendingBillingChange) => {
    deadlineRef.current = Date.now() + CHANGE_POLL_WINDOW_MS;
    setPending(change);
  }, []);

  useEffect(() => {
    if (handledReturnRef.current) return;
    const checkoutReturn = parseCheckoutReturn(searchParams);
    if (!checkoutReturn) return;
    handledReturnRef.current = true;
    // Drop the query so a reload does not replay the toast or restart the wait.
    router.replace(`${pathname}?section=billing`, { scroll: false });
    if (checkoutReturn.outcome === 'cancel') {
      show({ title: 'Checkout canceled', description: 'Nothing was charged.', variant: 'info' });
      return;
    }
    show({
      title: 'Payment received',
      description: 'Confirming with Stripe — this takes a few seconds.',
      variant: 'info',
      dedupeKey: PENDING_TOAST_KEY,
    });
    track(checkoutReturn.change);
  }, [pathname, router, searchParams, show, track]);

  useEffect(() => {
    if (!pending || !data || !isChangeSettled(pending, data)) return;
    show({ title: settledTitle(pending), variant: 'success', dedupeKey: PENDING_TOAST_KEY });
    setPending(null);
    // The sidebar's credits widget is server-rendered from the entitlements; re-render it.
    router.refresh();
  }, [data, pending, router, show]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(
      () => {
        show({
          title: 'Still waiting on Stripe',
          description: 'Your payment went through. Refresh in a minute to see it here.',
          variant: 'warning',
          dedupeKey: PENDING_TOAST_KEY,
        });
        setPending(null);
      },
      Math.max(deadlineRef.current - Date.now(), 0),
    );
    return () => clearTimeout(timer);
  }, [pending, show]);

  return { overview, pending, track };
}
