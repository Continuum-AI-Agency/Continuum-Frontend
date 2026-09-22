// The billing funnel in PostHog: paywall → checkout started → completed, plus the nudges that
// feed it. posthog-js (~293 KiB) loads lazily (instrumentation-client) and this module sits on
// every route's error path (lib/api/errors → paymentRequired), so it is imported on demand,
// never statically. Before PostHog has initialised, an event is dropped, not queued.

type EventProps = Record<string, string | number | boolean | null | undefined>;

export type BillingEventName =
  /** Settings → Billing opened by a gate, with the plan that unlocks `product` highlighted. */
  | 'paywall_viewed'
  /** A 402 became the Upgrade / Buy credits toast. */
  | 'payment_required_shown'
  | 'checkout_started'
  /** The webhook's grant became visible after a Checkout return. */
  | 'checkout_completed'
  /** The once-per-low-spell credits toast. */
  | 'low_credits_nudge_shown';

export function trackBillingEvent(event: BillingEventName, props?: EventProps): void {
  if (typeof window === 'undefined') return;
  void import('posthog-js')
    .then(({ default: posthog }) => posthog.capture(event, props))
    .catch((error: unknown) => console.warn('[billing-telemetry] capture failed', event, error));
}
