// H13 Account doctor: a list of checks, each with where it is fixed. No score: a 0–100 number would
// need weights nobody has decided, so the headline is "N of M checks pass", counted only over the
// checks that could be read. A check whose source is not here or whose read failed is listed as
// not readable, never as passing.
//
// The checks, in order, and where each comes from:
//   - Optimizer portfolios: the reading's issues (ctx.reading.issues — stale, lost its campaigns,
//     autopilot paused), one failing check each; with none, one passing check over the active
//     portfolios (optimizer_list_portfolios).
//   - Google delivery, per Google Ads account: the engine's account-wide google_delivery_issue card
//     (optimizer_get_platform_cards, google_ads) in the Google tab's own words
//     (googleDeliveryStatusOf). A single dark campaign is that campaign's card, not the account's
//     status. An account no portfolio watches has no card either way: not readable.
//   - Measurement, per ad account: the guards of the account's daily read
//     (optimizer_get_account_read → read.guards[]), one failing check per guard; a read with no
//     guard passes; no read stored is not readable.
//   - Setup: the first-run setup's tracked steps (deriveDashboardSetup).
//   - Hygiene: the Backend's Account hygiene read (R5), naming violations and ads running longer
//     than 30 days. `ok` passes, `warn` and `fail` need fixing, `unknown` stays not readable: a
//     brand that never chose a naming convention is not in violation of one. Until the Backend
//     deploys, both are listed as not readable yet.
//
// Disconnected accounts are not a check: an account whose grant is revoked drops out of the
// brand's integration summary (it is not in ctx.adAccounts at all), and no stored per-account
// connection status exists (integration_accounts_assets.status is null on 312 of 313 Meta ad
// accounts, 2026-11-03).
//
// Headline (bench anchor): `data-value` = the passing count, `data-total` = the readable count
// (passing + failing); see the reads above for the direct SQL of each check.

import {
  ACCOUNT_DETECTOR_META,
  type AccountCandidate,
  HOME_STALE_AD_DAYS,
  type HomeAccountHygieneData,
  type HomeHygieneCheck,
  type HomeHygieneCheckId,
  type HomeHygieneExample,
  type HomeHygieneStatus,
  type HomeIssue,
  type HomeReadMissingReason,
  type PortfolioListItem,
  titleText,
} from '@continuum/contracts';
import type { DashboardSetupState } from '@/components/dashboard/first-run/setupState';
import { googleDeliveryStatusOf } from '@/components/paid-media/optimizer/sections/platforms/googleDeliveryStatusModel';
import type {
  AccountReadEnvelope,
  PlatformCardsState,
} from '@/components/paid-media/optimizer/useOptimizerData';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { bareAccountId } from '@/lib/paid-media/accountId';
import type { HomeReadLoad } from '../../homeRead';
import { optimizerHref } from '../pacing/pacingModel';

export type DoctorPortfolio = Pick<
  PortfolioListItem,
  'id' | 'name' | 'status' | 'apply_mode' | 'ad_account_id' | 'platforms'
>;

export type DoctorPortfoliosRead =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'ready'; rows: readonly DoctorPortfolio[] };

export type DoctorAccountRead = {
  account: HomeAdAccount;
  status: 'pending' | 'error' | 'success';
  data: AccountReadEnvelope | undefined;
};

export type DoctorInputs = {
  issues: readonly HomeIssue[];
  portfolios: DoctorPortfoliosRead;
  adAccounts: readonly HomeAdAccount[];
  accountReads: readonly DoctorAccountRead[];
  /** Null when the brand has no Google Ads account (nothing is read). */
  googleCards: PlatformCardsState | null;
  setup: DashboardSetupState | null;
  hygiene: HomeReadLoad<HomeAccountHygieneData>;
};

export type DoctorCheckStatus = 'pass' | 'fail' | 'loading' | 'unreadable';
export type DoctorFix = { label: string; href: string; external: boolean };

export type DoctorCheck = {
  id: string;
  label: string;
  detail: string;
  status: DoctorCheckStatus;
  fix: DoctorFix | null;
  /** The hygiene read's own verdict, which `status` folds `warn` and `fail` into. */
  hygiene?: HomeHygieneStatus;
  /** The worst of what failed, in the read's words. */
  examples?: readonly HomeHygieneExample[];
};

export type DoctorView =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'missing'; reason: string }
  | { state: 'ready'; checks: DoctorCheck[]; passing: number; failing: number; total: number };

export const DOCTOR_MISSING =
  'Nothing here can be checked yet — connect an ad account in Settings.';

const NOT_READ = 'could not be read right now.';
const PHASE_B_DETAIL = 'not readable yet: Continuum does not read this across the account yet.';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function optimizerFix(adAccountId: string | null): DoctorFix {
  return { label: 'Open in the Optimizer', href: optimizerHref(adAccountId), external: false };
}

function sameAccount(a: string | null, b: string): boolean {
  return a !== null && bareAccountId(a) === bareAccountId(b);
}

function portfolioChecks(
  issues: readonly HomeIssue[],
  portfolios: DoctorPortfoliosRead,
): DoctorCheck[] {
  const rows = portfolios.status === 'ready' ? portfolios.rows : [];
  if (issues.length > 0) {
    return issues.map((issue, index) => ({
      id: `issue:${issue.portfolioId}:${index}`,
      label: issue.title,
      detail: 'The Optimizer cannot rely on this portfolio until it is fixed there.',
      status: 'fail',
      fix: optimizerFix(rows.find((row) => row.id === issue.portfolioId)?.ad_account_id ?? null),
    }));
  }
  if (portfolios.status === 'pending') {
    return [
      { id: 'portfolios', label: 'Optimizer portfolios', detail: '', status: 'loading', fix: null },
    ];
  }
  if (portfolios.status === 'error') {
    return [
      {
        id: 'portfolios',
        label: 'Optimizer portfolios',
        detail: `The Optimizer’s portfolios ${NOT_READ}`,
        status: 'unreadable',
        fix: null,
      },
    ];
  }
  const acting = rows.filter((row) => row.status === 'active' && row.apply_mode !== 'observe');
  if (acting.length === 0) return [];
  return [
    {
      id: 'portfolios',
      label: 'Every active portfolio reads fresh data',
      detail: `${plural(acting.length, 'active portfolio', 'active portfolios')}: none has gone stale or lost its campaigns, and autopilot runs wherever it is on.`,
      status: 'pass',
      fix: optimizerFix(null),
    },
  ];
}

/** The Google cards on one account: a card's portfolios name its account; with one Google
 *  account on the brand, every Google card is that account's. */
function cardsOnAccount(
  cards: readonly AccountCandidate[],
  account: HomeAdAccount,
  rows: readonly DoctorPortfolio[],
  googleAccounts: number,
): AccountCandidate[] {
  if (googleAccounts === 1) return [...cards];
  return cards.filter((card) =>
    card.portfolio_ids.some((id) =>
      sameAccount(rows.find((row) => row.id === id)?.ad_account_id ?? null, account.id),
    ),
  );
}

function watched(
  account: HomeAdAccount,
  rows: readonly DoctorPortfolio[],
  googleAccounts: number,
): boolean {
  return rows.some(
    (row) =>
      row.status === 'active' &&
      (sameAccount(row.ad_account_id, account.id) ||
        (googleAccounts === 1 && row.platforms.includes('google_ads'))),
  );
}

function deliveryCheck(
  account: HomeAdAccount,
  cards: PlatformCardsState | null,
  portfolios: DoctorPortfoliosRead,
  googleAccounts: number,
): DoctorCheck {
  const id = `delivery:${account.id}`;
  const label = `${account.name}: Google shows this account’s ads`;
  if (!cards || cards.status === 'loading' || portfolios.status === 'pending') {
    return { id, label, detail: '', status: 'loading', fix: null };
  }
  if (cards.status !== 'ready' || portfolios.status === 'error') {
    return {
      id,
      label,
      detail: `The Optimizer’s Google findings ${NOT_READ}`,
      status: 'unreadable',
      fix: null,
    };
  }
  const status = googleDeliveryStatusOf(
    cardsOnAccount(cards.cards, account, portfolios.rows, googleAccounts),
  );
  if (status) {
    return {
      id,
      label: `${account.name}: ${status.title}`,
      detail: status.detail,
      status: 'fail',
      fix: { label: 'Open in Google Ads', href: status.href, external: true },
    };
  }
  if (!watched(account, portfolios.rows, googleAccounts)) {
    return {
      id,
      label,
      detail:
        'No Optimizer portfolio watches this account’s delivery, so it is not readable yet. Group its campaigns in a portfolio to have it checked daily.',
      status: 'unreadable',
      fix: optimizerFix(account.id),
    };
  }
  return {
    id,
    label,
    detail: 'The Optimizer’s daily check finds campaigns serving on this account.',
    status: 'pass',
    fix: null,
  };
}

function measurementChecks(read: DoctorAccountRead): DoctorCheck[] {
  const { account } = read;
  const id = `measurement:${account.id}`;
  const label = `${account.name}: measurement guards pass`;
  if (read.status === 'pending') return [{ id, label, detail: '', status: 'loading', fix: null }];
  if (read.status === 'error') {
    return [
      {
        id,
        label,
        detail: `This account’s daily read ${NOT_READ}`,
        status: 'unreadable',
        fix: null,
      },
    ];
  }
  const guards = read.data?.read?.guards;
  if (!guards) {
    return [
      {
        id,
        label,
        detail: 'No daily read is stored for this account yet, so its measurement is not readable.',
        status: 'unreadable',
        fix: null,
      },
    ];
  }
  if (guards.length === 0) {
    return [
      {
        id,
        label,
        detail: 'Today’s read found nothing wrong with how results are counted.',
        status: 'pass',
        fix: null,
      },
    ];
  }
  return guards.map((guard) => ({
    id: `guard:${account.id}:${guard.id}`,
    label: `${account.name}: ${ACCOUNT_DETECTOR_META[guard.detector].label}`,
    detail: guard.title ? titleText(guard.title) : guard.impact_basis,
    status: 'fail',
    fix: optimizerFix(account.id),
  }));
}

function setupChecks(setup: DashboardSetupState | null): DoctorCheck[] {
  if (!setup) return [];
  return setup.steps
    .filter((step) => step.tracked)
    .map((step) => ({
      id: `setup:${step.id}`,
      label: step.label,
      detail: step.description,
      status: step.status === 'done' ? 'pass' : 'fail',
      fix: step.status === 'done' ? null : { label: step.cta, href: step.href, external: false },
    }));
}

const HYGIENE_LABEL: Record<HomeHygieneCheckId, string> = {
  naming: 'Campaign and ad names follow the naming convention',
  stale_ads: `No ad has run longer than ${HOME_STALE_AD_DAYS} days`,
};

const PENDING_DETAIL: Record<HomeHygieneCheckId, string> = {
  naming: `Naming violations are ${PHASE_B_DETAIL}`,
  stale_ads: `Ad age is ${PHASE_B_DETAIL}`,
};

const MISSING_DETAIL: Record<HomeReadMissingReason, string> = {
  no_ad_account: 'The brand has no Meta ad account to check.',
  no_organic_account: 'The brand has no Meta ad account to check.',
  no_portfolio: 'The brand has no Meta ad account to check.',
  no_data: 'The brand’s Meta ads have not synced recently enough to check.',
  not_deployed: PHASE_B_DETAIL,
  no_goal_target: PHASE_B_DETAIL,
};

const HYGIENE_IDS: readonly HomeHygieneCheckId[] = ['naming', 'stale_ads'];

const HYGIENE_STATUS: Record<HomeHygieneStatus, DoctorCheckStatus> = {
  ok: 'pass',
  warn: 'fail',
  fail: 'fail',
  unknown: 'unreadable',
};

function hygieneCheck(check: HomeHygieneCheck): DoctorCheck {
  const status = HYGIENE_STATUS[check.status];
  return {
    id: `hygiene:${check.id}`,
    label: HYGIENE_LABEL[check.id],
    detail: check.detail,
    status,
    hygiene: check.status,
    examples: check.examples,
    fix: status === 'fail' && check.id === 'stale_ads' ? optimizerFix(null) : null,
  };
}

function hygieneChecks(hygiene: HomeReadLoad<HomeAccountHygieneData>): DoctorCheck[] {
  if (hygiene.status === 'ready') return hygiene.data.checks.map(hygieneCheck);
  const unread = (
    id: HomeHygieneCheckId,
    detail: string,
    status: DoctorCheckStatus,
  ): DoctorCheck => ({
    id: `hygiene:${id}`,
    label: HYGIENE_LABEL[id],
    detail,
    status,
    fix: null,
  });
  return HYGIENE_IDS.map((id) => {
    if (hygiene.status === 'loading') return unread(id, '', 'loading');
    if (hygiene.status === 'missing') {
      return unread(id, MISSING_DETAIL[hygiene.missing.reason], 'unreadable');
    }
    return unread(id, PENDING_DETAIL[id], 'unreadable');
  });
}

function everyRemoteReadFailed(inputs: DoctorInputs): boolean {
  const cardsFailed =
    inputs.googleCards === null ||
    inputs.googleCards.status === 'error' ||
    inputs.googleCards.status === 'unavailable';
  return (
    inputs.portfolios.status === 'error' &&
    inputs.accountReads.every((read) => read.status === 'error') &&
    cardsFailed
  );
}

export function doctorView(inputs: DoctorInputs): DoctorView {
  const googleAccounts = inputs.adAccounts.filter((account) => account.platform === 'google_ads');
  const checks: DoctorCheck[] = [
    ...portfolioChecks(inputs.issues, inputs.portfolios),
    ...googleAccounts.map((account) =>
      deliveryCheck(account, inputs.googleCards, inputs.portfolios, googleAccounts.length),
    ),
    ...inputs.accountReads.flatMap(measurementChecks),
    ...setupChecks(inputs.setup),
    ...hygieneChecks(inputs.hygiene),
  ];
  if (checks.some((check) => check.status === 'loading')) return { state: 'loading' };
  if (everyRemoteReadFailed(inputs)) return { state: 'error' };
  const passing = checks.filter((check) => check.status === 'pass').length;
  const failing = checks.filter((check) => check.status === 'fail').length;
  if (passing + failing === 0) return { state: 'missing', reason: DOCTOR_MISSING };
  return { state: 'ready', checks, passing, failing, total: passing + failing };
}

/** The checks to fix first: failing ones, in list order. */
export function failingChecks(checks: readonly DoctorCheck[]): DoctorCheck[] {
  return checks.filter((check) => check.status === 'fail');
}
