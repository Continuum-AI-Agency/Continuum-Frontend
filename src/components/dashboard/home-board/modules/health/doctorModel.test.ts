import { describe, expect, it } from 'bun:test';
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
    expect(unreadable.map((check) => check.id)).toEqual(['phase_b:naming', 'phase_b:ad_age']);
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
    });
    expect(view).toEqual({ state: 'missing', reason: DOCTOR_MISSING });
  });
});
