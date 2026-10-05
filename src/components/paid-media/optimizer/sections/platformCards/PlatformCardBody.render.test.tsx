import { afterEach, describe, expect, it } from 'bun:test';
import { CrossPlatformMoveCardSchema, PlatformCardSchema } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import {
  CROSS_PLATFORM_MOVE,
  EVERY_CARD,
  GOOGLE_BUDGET_LIMITED,
  GOOGLE_PMAX,
  GOOGLE_VIDEO,
  TIKTOK_FATIGUE,
  TIKTOK_SCHEDULED,
} from './__fixtures__/platformCards';
import { PlatformCardBody } from './PlatformCardBody';
import {
  isReadOnly,
  legChangeLabel,
  movedPerDay,
  platformCardOf,
  platformsOf,
  scheduledLabel,
} from './platformCardModel';

afterEach(cleanup);

describe('Google budget-limited', () => {
  it('leads with the impression share lost to budget and the cost per result', () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={GOOGLE_BUDGET_LIMITED} />);
    expect(getByRole('heading').textContent).toBe(
      'VIVO 47-EKATAR loses 28% of impressions to budget with leads at 773 MXN, 6 days running',
    );
    expect(getByTestId('platform-card-budget').textContent).toBe(
      'Campaign budget 1,179 MXN/day, 28% of impressions lost to budget. Proposed: 1,474 MXN/day.',
    );
  });

  it('says no increase is proposed when the producer proposes none', () => {
    const card = PlatformCardSchema.parse({
      ...GOOGLE_BUDGET_LIMITED,
      proposed_budget_per_day: null,
    });
    const { getByTestId } = render(<PlatformCardBody card={card} />);
    expect(getByTestId('platform-card-budget').textContent).toEndWith('No increase proposed.');
  });
});

describe('PMax asset group', () => {
  it('lists what each group is missing and never a per-group conversion', () => {
    const { getByRole, getByTestId, container } = render(<PlatformCardBody card={GOOGLE_PMAX} />);
    expect(getByRole('heading').textContent).toBe(
      'PMax Necesidades SLP: 1 of 2 asset groups are missing assets',
    );
    const groups = getByTestId('platform-card-asset-groups').textContent ?? '';
    expect(groups).toContain(
      'Canadas · ad strength Poor · missing 3 vertical videos, 4 long headlines',
    );
    expect(groups).toContain('ITESO · ad strength Excellent · nothing missing');
    expect(container.textContent).toContain('Google does not report conversions per asset group');
    expect(container.textContent).not.toMatch(/conversions? at|per lead/);
  });
});

describe('YouTube read-only', () => {
  it('sends a person to Google Ads and is read-only', () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={GOOGLE_VIDEO} />);
    expect(getByRole('heading').textContent).toBe(
      'Video | Vivo 47 | 2025 is a Video campaign, read-only here',
    );
    const link = getByTestId('platform-card-open-google');
    expect(link.textContent).toBe('Open in Google Ads');
    expect(link.getAttribute('href')).toBe(
      'https://ads.google.com/aw/campaigns?campaignId=22357506361',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(getByTestId('platform-card-readonly').textContent).toContain(
      'Google does not let the API pause or change budgets on Video campaigns',
    );
    expect(isReadOnly(GOOGLE_VIDEO)).toBe(true);
    expect(EVERY_CARD.filter(isReadOnly)).toEqual([GOOGLE_VIDEO]);
  });
});

describe('TikTok creative fatigue', () => {
  it('states the CTR before and now, the frequency and the replacement', () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={TIKTOK_FATIGUE} />);
    expect(getByRole('heading').textContent).toBe(
      '"21-day challenge" fell from 2.1% to 0.8% CTR in 9 days with frequency 4.3',
    );
    expect(getByTestId('platform-card-fatigue').textContent).toContain(
      '"Post 22/09" runs at 3.4% CTR.',
    );
  });
});

describe('TikTok scheduled decrease', () => {
  it("explains the 105% floor and when the decrease lands, in the advertiser's timezone", () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={TIKTOK_SCHEDULED} />);
    expect(getByRole('heading').textContent).toBe(
      'EF | Leads | Intereses fitness: budget down to 825 MXN/day from 1,000 MXN, scheduled for Thu, 1 Oct at 00:00 (America/Mexico_City)',
    );
    const body = getByTestId('platform-card-scheduled').textContent ?? '';
    expect(body).toContain('TikTok already spent 986 MXN today');
    expect(body).toContain('under 1,035 MXN (105% of today');
  });

  it('falls back to UTC for a timezone Intl does not know', () => {
    expect(scheduledLabel('2026-10-01T06:00:00Z', 'Not/AZone')).toBe('2026-10-01 06:00 (UTC)');
  });
});

describe('cross-platform move', () => {
  it('shows every leg, the same percentage on each giving leg, and the approval note', () => {
    const { getByRole, getAllByTestId, getByTestId } = render(
      <PlatformCardBody card={CROSS_PLATFORM_MOVE} />,
    );
    expect(getByRole('heading').textContent).toBe('Move 59.22 MXN/day from TikTok to Meta');
    const legs = getAllByTestId('platform-card-leg');
    expect(legs).toHaveLength(3);
    const changes = getAllByTestId('platform-card-leg-change').map((node) => node.textContent);
    expect(changes).toEqual(['−4.2%', '−4.2%', '+18%']);
    expect(legs[1]?.textContent).toContain('scheduled for');
    expect(getByTestId('platform-card-approval-note').textContent).toContain(
      'We recommend a person approves moves between platforms',
    );
    expect(platformsOf(CROSS_PLATFORM_MOVE)).toEqual(['tiktok_ads', 'meta']);
    expect(movedPerDay(CROSS_PLATFORM_MOVE.legs)).toBeCloseTo(59.22, 2);
  });

  it('refuses giving legs with different percentages, or a move that does not net to zero', () => {
    const uneven = {
      ...CROSS_PLATFORM_MOVE,
      legs: CROSS_PLATFORM_MOVE.legs.map((leg, index) =>
        index === 0 ? { ...leg, to_per_day: 360, scheduled_at: null } : leg,
      ),
    };
    expect(CrossPlatformMoveCardSchema.safeParse(uneven).success).toBe(false);
    expect(
      legChangeLabel({
        platform: 'meta',
        entity_name: 'x',
        from_per_day: 0,
        to_per_day: 5,
        scheduled_at: null,
      }),
    ).toBe('new');
  });
});

describe('platformCardOf', () => {
  const candidate = (platform_card: unknown) =>
    ({ platform_card }) as unknown as Parameters<typeof platformCardOf>[0];

  it('is null when the row carries no platform card, or one the contract refuses', () => {
    expect(platformCardOf(candidate(undefined))).toBeNull();
    expect(platformCardOf(candidate(null))).toBeNull();
    expect(platformCardOf(candidate({ variant: 'google_budget_limited' }))).toBeNull();
  });

  it('returns the parsed card for every variant', () => {
    for (const card of EVERY_CARD) {
      expect(platformCardOf(candidate(card))?.variant).toBe(card.variant);
    }
  });
});
