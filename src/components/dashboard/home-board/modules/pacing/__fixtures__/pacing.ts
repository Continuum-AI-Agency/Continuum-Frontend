// Shaped on prod, 2026-11-03 (read-only probe): Easy Fit's Meta brand (148583e0) holds the one live
// flight on the platform — "Conversaciones Whatsapp", 90,000 MXN over Nov 1–30 — and its cycle on
// Nov 3 paced it at day 3 with 1,541.36 MXN spent against an ideal 6,000. d666c706's
// "Mensajes - Octubre" (7,064, Oct 8–31) carries no currency on the row; its account does.
import type { CycleRunPacing } from '@continuum/contracts';
import type { PacingPortfolio, PacingRunRead } from '../pacingModel';

export const EASY_FIT_FLIGHT: PacingPortfolio = {
  id: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
  name: 'Conversaciones Whatsapp',
  status: 'active',
  ad_account_id: 'act_521903353286118',
  currency: 'MXN',
  period_budget: 90_000,
  period_start: '2026-11-01',
  period_end: '2026-11-30',
};

export const EASY_FIT_RUN: CycleRunPacing = {
  note: 'Underpacing (26%): daily raised to $3,159 MXN to catch up.',
  source: 'pacing',
  status: 'underpacing',
  dayIndex: 3,
  periodEnd: '2026-11-30',
  dailyTotal: 3159.2371428571428,
  periodDays: 30,
  pacingRatio: 0.2568933333333333,
  periodStart: '2026-11-01',
  planVersion: '2026-11-01..2026-11-30@90000',
  periodBudget: 90_000,
  idealCumulative: 6000,
  actualSpendToDate: 1541.36,
};

export const NO_FLIGHT: PacingPortfolio = {
  id: '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4',
  name: 'Leads // Google Ads only',
  status: 'active',
  ad_account_id: 'act_521903353286118',
  currency: 'MXN',
  period_budget: null,
  period_start: null,
  period_end: null,
};

export const OCTOBER_FLIGHT: PacingPortfolio = {
  id: '8b890196-0db1-44b2-8394-21b2f08322ec',
  name: 'Mensajes - Octubre',
  status: 'active',
  ad_account_id: 'act_2870759213321514',
  currency: null,
  period_budget: 7064,
  period_start: '2026-10-08',
  period_end: '2026-10-31',
};

export const USD_FLIGHT: PacingPortfolio = {
  id: '5d6f1c1e-0000-4000-8000-000000000001',
  name: 'US prospecting',
  status: 'active',
  ad_account_id: 'act_111',
  currency: 'USD',
  period_budget: 3000,
  period_start: '2026-11-01',
  period_end: '2026-11-30',
};

export const USD_RUN: CycleRunPacing = {
  note: 'On plan.',
  source: 'pacing',
  status: 'on_track',
  dayIndex: 3,
  dailyTotal: 100,
  periodDays: 30,
  pacingRatio: 1,
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  planVersion: '2026-11-01..2026-11-30@3000',
  periodBudget: 3000,
  idealCumulative: 200,
  actualSpendToDate: 205,
};

/** The flat fallback the engine writes before a flight is paced: never a spend reading. */
export const FIXED_RUN: CycleRunPacing = {
  note: 'No pacing state: using the provided total.',
  source: 'fixed',
  status: 'unknown',
  dailyTotal: 1200,
  pacingRatio: 1,
  idealCumulative: 0,
};

export function ready(pacing: CycleRunPacing | null): PacingRunRead {
  return { status: 'ready', pacing };
}
