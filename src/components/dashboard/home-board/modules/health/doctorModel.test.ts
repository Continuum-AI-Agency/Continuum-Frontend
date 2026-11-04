import { describe, expect, it } from 'bun:test';
import type { HomeHygieneCheck } from '@continuum/contracts';
import { deriveDashboardSetup } from '@/components/dashboard/first-run/setupState';
import { EASY_FIT_GOOGLE, EASY_FIT_META } from '../pacing/__fixtures__/ctx';
import {
  GOOGLE_PORTFOLIO,
  META_PORTFOLIO,
  ONE_DARK_CAMPAIGN,
  READ_NO_GUARDS,
  READ_WITH_GUARD,
  SUSPENDED_CARD,
} from './__fixtures__/doctor';
import { DOCTOR_MISSING, type DoctorInputs, doctorView } from './doctorModel';

const SETUP_NO_BOOK = deriveDashboardSetup({
  hasConnectedProviders: true,
  hasAssignedAccounts: true,
  brandBook: null,
});

function inputs(overrides: Partial<DoctorInputs> = {}): DoctorInputs {
  return {
    issues: [],
    portfolios: { status: 'ready', rows: [META_PORTFOLIO, GOOGLE_PORTFOLIO] },
    adAccounts: [EASY_FIT_META, EASY_FIT_GOOGLE],
    accountReads: [
      { account: EASY_FIT_META, status: 'success', data: READ_NO_GUARDS },
      { account: EASY_FIT_GOOGLE, status: 'success', data: READ_NO_GUARDS },
    ],
    googleCards: { status: 'ready', cards: [] },
    setup: SETUP_NO_BOOK,
    hygiene: { status: 'unavailable' },
    ...overrides,
  };
}

function ready(view: ReturnType<typeof doctorView>) {
  if (view.state !== 'ready') throw new Error(`expected ready, got ${view.state}`);
  return view;
}

describe('doctorView', () => {
  it('counts passing checks out of the readable ones, never the not-readable ones', () => {
    const view = ready(doctorView(inputs()));
    // portfolios fresh, Google delivering, 2 measurement reads clean, 3 setup steps (1 todo).
    expect(view.total).toBe(7);
    expect(view.passing).toBe(6);
    expect(view.failing).toBe(1);
    const failing = view.checks.filter((check) => check.status === 'fail');
    expect(failing.map((check) => check.id)).toEqual(['setup:brand_book']);
    expect(failing[0]?.fix).toEqual({
      label: 'Generate Brand Book',
      href: '/settings?section=brand-book',
      external: false,
    });
  });

  it('lists naming and ad age as not readable yet, never as passing', () => {
    const view = ready(doctorView(inputs()));
    const unreadable = view.checks.filter((check) => check.status === 'unreadable');
    expect(unreadable.map((check) => check.id)).toEqual(['hygiene:naming', 'hygiene:stale_ads']);
    for (const check of unreadable) expect(check.detail).toContain('not readable yet');
  });

  it('fails a suspended Google account, with Google’s words and the place it is fixed', () => {
    const view = ready(
      doctorView(inputs({ googleCards: { status: 'ready', cards: [SUSPENDED_CARD] } })),
    );
    const google = view.checks.find((check) => check.id === `delivery:${EASY_FIT_GOOGLE.id}`);
    expect(google?.status).toBe('fail');
    expect(google?.label).toBe('Easy Fit Google: Google suspended this account’s campaigns');
    expect(google?.detail).toContain('No ad shown since Oct 26 (8 days)');
    expect(google?.fix).toEqual({
      label: 'Open in Google Ads',
      href: 'https://ads.google.com/aw/campaigns',
      external: true,
    });
  });

  it('reads one dark campaign as that campaign’s card, not the account’s status', () => {
    const view = ready(
      doctorView(inputs({ googleCards: { status: 'ready', cards: [ONE_DARK_CAMPAIGN] } })),
    );
    expect(view.checks.find((check) => check.id === `delivery:${EASY_FIT_GOOGLE.id}`)?.status).toBe(
      'pass',
    );
  });

  it('cannot read delivery for a Google account no portfolio watches', () => {
    const view = ready(
      doctorView(inputs({ portfolios: { status: 'ready', rows: [META_PORTFOLIO] } })),
    );
    const google = view.checks.find((check) => check.id === `delivery:${EASY_FIT_GOOGLE.id}`);
    expect(google?.status).toBe('unreadable');
    expect(google?.detail).toContain('No Optimizer portfolio watches');
  });

  it('fails a measurement guard on the account it fired on, linking to that account', () => {
    const view = ready(
      doctorView(
        inputs({
          accountReads: [
            { account: EASY_FIT_META, status: 'success', data: READ_WITH_GUARD },
            { account: EASY_FIT_GOOGLE, status: 'success', data: READ_NO_GUARDS },
          ],
        }),
      ),
    );
    const guard = view.checks.find((check) => check.id.startsWith('guard:'));
    expect(guard?.status).toBe('fail');
    expect(guard?.label).toBe('Easy Fit: The figures cannot be trusted');
    expect(guard?.detail).toBe('Easy Fit: 2 campañas sin eventos registrados, de 5 activas');
    expect(guard?.fix?.href).toBe('/scale?tab=performance&adAccountId=act_521903353286118');
    expect(view.checks.some((check) => check.id === `measurement:${EASY_FIT_META.id}`)).toBe(false);
  });

  it('cannot read measurement for an account with no daily read stored', () => {
    const view = ready(
      doctorView(
        inputs({
          accountReads: [
            { account: EASY_FIT_META, status: 'success', data: null },
            { account: EASY_FIT_GOOGLE, status: 'success', data: READ_NO_GUARDS },
          ],
        }),
      ),
    );
    expect(
      view.checks.find((check) => check.id === `measurement:${EASY_FIT_META.id}`)?.status,
    ).toBe('unreadable');
    expect(view.total).toBe(6);
  });

  it('turns each reading issue into a failing check that opens its portfolio’s account', () => {
    const view = ready(
      doctorView(
        inputs({
          issues: [
            {
              portfolioId: META_PORTFOLIO.id,
              title: 'Conversaciones Whatsapp has read no new data for 4 days',
            },
          ],
        }),
      ),
    );
    const issue = view.checks.find((check) => check.id.startsWith('issue:'));
    expect(issue?.status).toBe('fail');
    expect(issue?.label).toBe('Conversaciones Whatsapp has read no new data for 4 days');
    expect(issue?.fix?.href).toBe('/scale?tab=performance&adAccountId=act_521903353286118');
    expect(view.checks.some((check) => check.id === 'portfolios')).toBe(false);
  });

  it('is loading while a read is on its way', () => {
    expect(doctorView(inputs({ googleCards: { status: 'loading' } })).state).toBe('loading');
    expect(
      doctorView(
        inputs({
          accountReads: [{ account: EASY_FIT_META, status: 'pending', data: undefined }],
        }),
      ).state,
    ).toBe('loading');
  });

  it('is an error when every remote read failed', () => {
    const view = doctorView(
      inputs({
        portfolios: { status: 'error' },
        accountReads: [
          { account: EASY_FIT_META, status: 'error', data: undefined },
          { account: EASY_FIT_GOOGLE, status: 'error', data: undefined },
        ],
        googleCards: { status: 'error' },
      }),
    );
    expect(view.state).toBe('error');
  });

  it('marks a read that failed alone as not readable, and keeps the rest', () => {
    const view = ready(doctorView(inputs({ googleCards: { status: 'error' } })));
    const google = view.checks.find((check) => check.id === `delivery:${EASY_FIT_GOOGLE.id}`);
    expect(google?.status).toBe('unreadable');
    expect(google?.detail).toContain('could not be read');
  });

  it('is missing when nothing is readable to check', () => {
    const view = doctorView({
      issues: [],
      portfolios: { status: 'ready', rows: [] },
      adAccounts: [],
      accountReads: [],
      googleCards: null,
      setup: null,
      hygiene: { status: 'unavailable' },
    });
    expect(view).toEqual({ state: 'missing', reason: DOCTOR_MISSING });
  });
});

describe('doctorView with the Account hygiene read', () => {
  const check = (over: Partial<HomeHygieneCheck>): HomeHygieneCheck => ({
    id: 'stale_ads',
    status: 'ok',
    count: 0,
    total: 88,
    detail: 'No active ad has run longer than 30 days (88 active).',
    examples: [],
    source: { kind: 'paid_media.ads', ref: null, since: null, until: '2026-11-04' },
    ...over,
  });
  const ready = (checks: HomeHygieneCheck[]): DoctorInputs['hygiene'] => ({
    status: 'ready',
    generatedAt: '2026-11-04T12:00:00Z',
    data: { asOf: '2026-11-04T05:05:36Z', namingSchema: null, checks },
  });
  const readyView = (hygiene: DoctorInputs['hygiene']) => {
    const view = doctorView(inputs({ hygiene }));
    if (view.state !== 'ready') throw new Error(`expected ready, got ${view.state}`);
    return view;
  };
  const checksOf = (hygiene: DoctorInputs['hygiene']) =>
    readyView(hygiene).checks.filter((c) => c.id.startsWith('hygiene:'));

  it('replaces the two pending checks with what the read found', () => {
    const view = readyView(ready([check({ id: 'naming' }), check({ id: 'stale_ads' })]));
    expect(view.checks.every((c) => !c.detail.includes('not readable yet'))).toBe(true);
    expect(view.checks.filter((c) => c.id.startsWith('hygiene:')).map((c) => c.status)).toEqual([
      'pass',
      'pass',
    ]);
  });

  it('a warning and a failure both need fixing, and keep what the read said', () => {
    const [naming, stale] = checksOf(
      ready([
        check({ id: 'naming', status: 'fail', count: 9, total: 10, detail: '9 of 10 do not.' }),
        check({
          status: 'warn',
          count: 18,
          detail: '18 of 88 active ads have run longer than 30 days.',
          examples: [
            {
              level: 'ad',
              id: 'a1',
              name: 'ultrenagos',
              code: 'running_too_long',
              detail: 'Active for 61 days.',
              ageDays: 61,
              spendShare: null,
            },
          ],
        }),
      ]),
    );
    expect(naming?.status).toBe('fail');
    expect(naming?.hygiene).toBe('fail');
    expect(stale?.status).toBe('fail');
    expect(stale?.hygiene).toBe('warn');
    expect(stale?.detail).toContain('18 of 88');
    expect(stale?.examples?.[0]?.name).toBe('ultrenagos');
  });

  it('unknown stays unknown: not passing, not failing, not counted', () => {
    const before = readyView({ status: 'unavailable' });
    const view = readyView(
      ready([
        check({
          id: 'naming',
          status: 'unknown',
          count: 154,
          total: 154,
          detail: 'The convention is still the platform default, never set for this brand.',
        }),
        check({ status: 'ok' }),
      ]),
    );
    const naming = view.checks.find((c) => c.id === 'hygiene:naming');
    expect(naming?.status).toBe('unreadable');
    expect(naming?.detail).toContain('never set');
    expect(view.total).toBe(before.total + 1);
  });

  it('a read that holds nothing names why, and counts as nothing', () => {
    const [naming, stale] = checksOf({
      status: 'missing',
      missing: { reason: 'no_data', detail: 'Ads were last synced 20 days ago.' },
    });
    expect(naming?.status).toBe('unreadable');
    expect(stale?.status).toBe('unreadable');
    expect(naming?.detail).toBe('The brand’s Meta ads have not synced recently enough to check.');
  });

  it('waits for the read', () => {
    expect(doctorView(inputs({ hygiene: { status: 'loading' } })).state).toBe('loading');
  });
});
