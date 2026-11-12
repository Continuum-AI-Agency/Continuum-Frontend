import type { useTranslations } from 'next-intl';

type SetupCopy = ReturnType<typeof useTranslations<'dashboard'>>;

// First-run setup model for the dashboard (IMP-001 / IMP-003 / IMP-005).
//
// A brand can be *selected* yet not *set up*: it has no connected provider, no
// assigned account, and no materialized Brand Book, so every dashboard module
// renders empty. This module projects the handful of setup signals the RSC
// already fetches into a single, testable `DashboardSetupState` that drives the
// guided-setup checklist, the Brand Book milestone card, and the gate deciding
// whether the first-run experience replaces (empty) or leads (partial) the live
// data views. It re-uses the persisted readiness via `selectReadinessSummary`
// rather than re-deriving or re-fetching it.

import type { BrandBookResponse, BrandBookStatus, ReadinessSummary } from '@continuum/contracts';

import { selectReadinessSummary } from '@/lib/readiness/readinessSummary';

export type DashboardSetupStepId =
  | 'connect'
  | 'assign'
  | 'brand_book'
  | 'competitors'
  | 'first_plan';

export type DashboardSetupStepStatus = 'done' | 'todo';

export interface DashboardSetupStep {
  id: DashboardSetupStepId;
  label: string;
  description: string;
  cta: string;
  href: string;
  status: DashboardSetupStepStatus;
  // `tracked` steps have a real completion signal (connect / assign / brand
  // book) and gate the first-run exit. Guidance-only steps (competitors, first
  // plan) have no cheap server signal yet, so they surface as open action items
  // without ever claiming a false "done".
  tracked: boolean;
}

export interface DashboardSetupState {
  steps: DashboardSetupStep[];
  completedCount: number;
  trackedCount: number;
  // True once any account is assigned to the brand — i.e. there is live data to
  // show, so the first-run experience LEADS the data views instead of replacing
  // them.
  hasConnectedData: boolean;
  brandBookReady: boolean;
  brandBookStatus: BrandBookStatus | null;
  // Every tracked step complete → drop the first-run surface entirely.
  isComplete: boolean;
  /** Null while the brand's readiness has never been scored. */
  readiness: ReadinessSummary | null;
}

export interface DashboardSetupSignals {
  hasConnectedProviders: boolean;
  hasAssignedAccounts: boolean;
  brandBook: BrandBookResponse | null;
}

export const SETTINGS_INTEGRATIONS_HREF = '/settings?section=integrations';
export const SETTINGS_BRAND_BOOK_HREF = '/settings?section=brand-book';
export const COMPETITOR_HREF = '/competitor-spy';
export const ORGANIC_HREF = '/organic';

function stepStatus(done: boolean): DashboardSetupStepStatus {
  return done ? 'done' : 'todo';
}

export function deriveDashboardSetup(
  signals: DashboardSetupSignals,
  t?: SetupCopy,
): DashboardSetupState {
  const { hasConnectedProviders, hasAssignedAccounts, brandBook } = signals;

  const brandBookStatus: BrandBookStatus | null = brandBook?.status ?? null;
  const brandBookReady = brandBook?.present === true;
  const readiness = selectReadinessSummary(brandBook);

  const steps: DashboardSetupStep[] = [
    {
      id: 'connect',
      label: t ? t('home_a002b3f35f99') : 'Connect a provider',
      description: t
        ? t('home_0fa7cc727f96')
        : 'Link Meta, Instagram, or YouTube so Continuum can read your accounts.',
      cta: hasConnectedProviders
        ? t
          ? t('home_5ac8352de069')
          : 'Manage providers'
        : t
          ? t('home_3f137863d5cd')
          : 'Connect Meta',
      href: SETTINGS_INTEGRATIONS_HREF,
      status: stepStatus(hasConnectedProviders),
      tracked: true,
    },
    {
      id: 'assign',
      label: t ? t('home_84c8297ddc9f') : 'Assign an account to this brand',
      description: t
        ? t('home_3186579c65e5')
        : 'Point a connected account at this brand to unlock its metrics and reporting.',
      cta: hasAssignedAccounts
        ? t
          ? t('home_daeaf38abf62')
          : 'Manage accounts'
        : t
          ? t('home_1467ed6d7a94')
          : 'Assign account',
      href: SETTINGS_INTEGRATIONS_HREF,
      status: stepStatus(hasAssignedAccounts),
      tracked: true,
    },
    {
      id: 'brand_book',
      label: t ? t('home_08083c402e1b') : 'Generate your Brand Book',
      description: t
        ? t('home_50d6f0ae6c07')
        : "The foundation for voice, strategy, audience, and every agent's output.",
      cta: brandBookReady
        ? t
          ? t('home_4ca933111e47')
          : 'View Brand Book'
        : t
          ? t('home_ccb61699df1f')
          : 'Generate Brand Book',
      href: SETTINGS_BRAND_BOOK_HREF,
      status: stepStatus(brandBookReady),
      tracked: true,
    },
    {
      id: 'competitors',
      label: t ? t('home_ea153a5197dc') : 'Add competitors',
      description: t
        ? t('home_64d3eb867660')
        : 'Track rival organic and paid activity to benchmark your signals.',
      cta: t ? t('home_ea153a5197dc') : 'Add competitors',
      href: COMPETITOR_HREF,
      status: 'todo',
      tracked: false,
    },
    {
      id: 'first_plan',
      label: t ? t('home_8647ce5b3592') : 'Create your first plan',
      description: t
        ? t('home_5764ca99a323')
        : 'Turn brand context and signals into a scheduled content plan.',
      cta: t ? t('home_7f7eafae4f98') : 'Create a plan',
      href: ORGANIC_HREF,
      status: 'todo',
      tracked: false,
    },
  ];

  const trackedSteps = steps.filter((step) => step.tracked);
  const completedCount = trackedSteps.filter((step) => step.status === 'done').length;
  const isComplete = completedCount === trackedSteps.length;

  return {
    steps,
    completedCount,
    trackedCount: trackedSteps.length,
    hasConnectedData: hasAssignedAccounts,
    brandBookReady,
    brandBookStatus,
    isComplete,
    readiness,
  };
}

// Whether any platform in an integration summary carries at least one account.
// Works for both the brand-assigned summary and the user-connected summary since
// they share the `Record<PlatformKey, { accounts: unknown[] }>` shape.
export function hasAnyAccount(
  summary: Record<string, { accounts: readonly unknown[] }> | null | undefined,
): boolean {
  if (!summary) return false;
  return Object.values(summary).some((platform) => platform.accounts.length > 0);
}
