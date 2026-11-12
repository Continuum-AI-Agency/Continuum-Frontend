import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from '@/components/ui/toast-imperative';
import { creditsHref } from './productAccess';
import type { SidebarBillingView } from './sidebarBilling';
import { trackBillingEvent } from './telemetry';
import { openTopUp } from './topUp';

// One gentle heads-up when a brand's Canvas credits run low — before the 402 stops a generation,
// not after. Once per brand per low spell: remembered in localStorage and forgotten once the
// balance recovers, so the next dip nudges again and nothing repeats on every page load.

export type LowCreditsNudge = 'show' | 'forget' | 'skip';

export function decideLowCreditsNudge(input: {
  view: SidebarBillingView | null;
  /** Only the owner can buy credits; a member would be nudged toward a locked page. */
  owner: boolean;
  onBillingPage: boolean;
  alreadyNudged: boolean;
}): LowCreditsNudge {
  const { view } = input;
  if (view?.kind !== 'metered') return 'skip';
  if (!view.low) return input.alreadyNudged ? 'forget' : 'skip';
  // A spent balance gets the 402 toast at the moment it matters; the sidebar already shows it.
  if (view.exhausted || view.autoBilling.on) return 'skip';
  if (!input.owner || input.onBillingPage || input.alreadyNudged) return 'skip';
  return 'show';
}

const storageKey = (brandId: string) => `continuum.billing.lowCreditsNudged.${brandId}`;

function readNudged(brandId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(brandId)) === '1';
  } catch {
    return false;
  }
}

function writeNudged(brandId: string, nudged: boolean): void {
  try {
    if (nudged) window.localStorage.setItem(storageKey(brandId), '1');
    else window.localStorage.removeItem(storageKey(brandId));
  } catch {
    // Storage blocked: at worst the nudge shows once per page load of a low spell.
  }
}

export function useLowCreditsNudge(args: {
  view: SidebarBillingView | null;
  brandId: string;
  owner: boolean;
  pathname: string;
  section: string | null;
  navigate: (href: string) => void;
}): void {
  const uiText = useTranslations('common');
  const { view, brandId, owner, pathname, section, navigate } = args;
  const onBillingPage = pathname.startsWith('/settings') && section === 'billing';
  useEffect(() => {
    const decision = decideLowCreditsNudge({
      view,
      owner,
      onBillingPage,
      alreadyNudged: readNudged(brandId),
    });
    if (decision === 'forget') writeNudged(brandId, false);
    if (decision !== 'show' || view?.kind !== 'metered') return;
    writeNudged(brandId, true);
    const from = `${window.location.pathname}${window.location.search}`;
    toast.info(uiText('canvas_credits_are_running_low_0e9f9f4'), {
      description: uiText('brandCreditsLeft', { count: view.remainingCredits }),
      durationMs: 8_000,
      dedupeKey: 'billing-low-credits',
      action: {
        label: uiText('top_up_79f52e0'),
        onClick: () => openTopUp('nudge', () => navigate(creditsHref(from))),
      },
    });
    trackBillingEvent('low_credits_nudge_shown', { remainingCredits: view.remainingCredits });
  }, [view, brandId, owner, onBillingPage, navigate, uiText]);
}
