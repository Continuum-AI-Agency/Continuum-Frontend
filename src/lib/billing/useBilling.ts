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
import { FROM_PARAM, safeReturnPath } from './productAccess';
import { trackBillingEvent } from './telemetry';
import { withoutCheckoutReturn } from './topUp';

export const billingOverviewKey = (brandId: string) => ['billing', 'overview', brandId] as const;

/**
 * An absolute URL back to this settings page, for Stripe's success/cancel/return redirects. It
 * keeps `?from=` (the page that sent the buyer here), so the way back survives Checkout.
 */
export function billingReturnUrl(query: string): string {
  const params = new URLSearchParams(query);
  const from = safeReturnPath(new URLSearchParams(window.location.search).get(FROM_PARAM));
  if (from) params.set(FROM_PARAM, from);
  return `${window.location.origin}${window.location.pathname}?${params}`;
}

function useBillingOverview(brandId: string, pollIntervalMs: number | false, enabled: boolean) {
  return useQuery({
    queryKey: billingOverviewKey(brandId),
    enabled,
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
    case 'x_credits_added':
      return 'X API credits added';
    case 'x_overage_changed':
      return change.enabled ? 'X auto-billing is on' : 'X auto-billing is off';
  }
}

/** A Checkout return being confirmed as a printed receipt (CheckoutReceiptDialog). */
export type CheckoutReceiptState = {
  sessionId: string;
  /** Where the buyer came from: the receipt offers the way back. */
  from: string | null;
  /** Our webhook's grant: still polling, landed, or the wait ran out. */
  status: 'waiting' | 'settled' | 'timed_out';
};

/**
 * The brand's billing overview, plus any change Stripe has confirmed that our webhook may not
 * have applied yet — a Checkout return (?checkout=success|cancel) or a plan change made in the
 * panel. While one is pending the overview is polled until it shows, for at most
 * CHANGE_POLL_WINDOW_MS.
 *
 * `returnsOnly` is the app shell's use: a Top up bought from any page returns to that page, so
 * the shell confirms it there. It reads the overview only while a return is pending (members
 * never buy, so never read it), and `enabled: false` hands the return to the Billing page.
 *
 * A return that carries Stripe's session id prints a receipt instead of toasting: `receipt`
 * tracks it until `closeReceipt`. An older return link without one keeps the toasts.
 */
export function useBillingOverviewWithPendingChange(
  brandId: string,
  options: { returnsOnly?: boolean; enabled?: boolean } = {},
) {
  const { returnsOnly = false, enabled = true } = options;
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<PendingBillingChange | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceiptState | null>(null);
  const deadlineRef = useRef(0);
  const handledReturnRef = useRef(false);
  // A Checkout return, and where the buyer came from: the success toast offers the way back.
  const checkoutReturnRef = useRef<{ from: string | null; printsReceipt: boolean } | null>(null);
  const overview = useBillingOverview(
    brandId,
    pending ? CHANGE_POLL_INTERVAL_MS : false,
    enabled && (!returnsOnly || pending !== null),
  );
  const data = overview.data;

  const track = useCallback((change: PendingBillingChange) => {
    deadlineRef.current = Date.now() + CHANGE_POLL_WINDOW_MS;
    setPending(change);
  }, []);

  useEffect(() => {
    if (!enabled || handledReturnRef.current) return;
    const checkoutReturn = parseCheckoutReturn(searchParams);
    if (!checkoutReturn) return;
    handledReturnRef.current = true;
    // Only Billing offers a way back: a Top up returns to the page it was bought from.
    const from = returnsOnly ? null : safeReturnPath(searchParams.get(FROM_PARAM));
    // Drop the return's params so a reload does not replay the toast or restart the wait.
    const rest = withoutCheckoutReturn(searchParams.toString(), returnsOnly ? [] : [FROM_PARAM]);
    router.replace(`${pathname}${rest}`, { scroll: false });
    if (checkoutReturn.outcome === 'cancel') {
      show({ title: 'Checkout canceled', description: 'Nothing was charged.', variant: 'info' });
      return;
    }
    const { sessionId } = checkoutReturn;
    if (sessionId) {
      setReceipt({ sessionId, from, status: 'waiting' });
    } else {
      show({
        title: 'Payment received',
        description: 'Confirming with Stripe — this takes a few seconds.',
        variant: 'info',
        dedupeKey: PENDING_TOAST_KEY,
      });
    }
    checkoutReturnRef.current = { from, printsReceipt: sessionId !== null };
    track(checkoutReturn.change);
  }, [enabled, returnsOnly, pathname, router, searchParams, show, track]);

  useEffect(() => {
    if (!pending || !data || !isChangeSettled(pending, data)) return;
    const checkoutReturn = checkoutReturnRef.current;
    checkoutReturnRef.current = null;
    const from = checkoutReturn?.from ?? null;
    if (checkoutReturn?.printsReceipt) {
      setReceipt((current) => current && { ...current, status: 'settled' });
    } else {
      show({
        title: settledTitle(pending),
        variant: 'success',
        dedupeKey: PENDING_TOAST_KEY,
        // An offer, never a redirect: the buyer may want to look at what they bought first.
        ...(from
          ? {
              durationMs: 10_000,
              action: { label: 'Back to where you were', onClick: () => router.push(from) },
            }
          : {}),
      });
    }
    if (checkoutReturn) trackBillingEvent('checkout_completed', { kind: pending.kind });
    setPending(null);
    // The sidebar's credits widget is server-rendered from the entitlements; re-render it.
    router.refresh();
  }, [data, pending, router, show]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(
      () => {
        if (checkoutReturnRef.current?.printsReceipt) {
          setReceipt((current) => current && { ...current, status: 'timed_out' });
        } else {
          show({
            title: 'Still waiting on Stripe',
            description: 'Your payment went through. Refresh in a minute to see it here.',
            variant: 'warning',
            dedupeKey: PENDING_TOAST_KEY,
          });
        }
        checkoutReturnRef.current = null;
        setPending(null);
      },
      Math.max(deadlineRef.current - Date.now(), 0),
    );
    return () => clearTimeout(timer);
  }, [pending, show]);

  const closeReceipt = useCallback(() => setReceipt(null), []);

  return { overview, pending, track, receipt, closeReceipt };
}
