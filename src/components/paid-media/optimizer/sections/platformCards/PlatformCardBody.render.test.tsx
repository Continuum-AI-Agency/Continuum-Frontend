import { afterEach, describe, expect, it } from 'bun:test';
import { CrossPlatformMoveCardSchema, PlatformCardSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  CROSS_PLATFORM_MOVE,
  EVERY_CARD,
  GOOGLE_BID_TARGET,
  GOOGLE_BUDGET_LIMITED,
  GOOGLE_DELIVERY_ACCOUNT_WIDE,
  GOOGLE_DELIVERY_ONE_CAMPAIGN,
  GOOGLE_LOW_QUALITY_KEYWORD,
  GOOGLE_NEGATIVE_TERMS,
  GOOGLE_PMAX,
  GOOGLE_PROMOTE_TERM,
  GOOGLE_VIDEO,
  TIKTOK_ATTRIBUTION_WINDOW,
  TIKTOK_BUDGET_BELOW_LEARNING,
  TIKTOK_DELIVERY,
  TIKTOK_FATIGUE,
  TIKTOK_HOOK_RETENTION,
  TIKTOK_SCHEDULED,
  TIKTOK_SPARK_CANDIDATE,
} from './__fixtures__/platformCards';
import { PlatformCardBody } from './PlatformCardBody';
import {
  bidCooldownNote,
  googleReasonInWords,
  isReadOnly,
  legChangeLabel,
  markedPlatformOf,
  movedPerDay,
  PLATFORM_CARD_TYPE,
  platformCardActionLabel,
  platformCardOf,
  platformCardTitle,
  platformsOf,
  scheduledLabel,
  tiktokStatusInWords,
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
    expect(EVERY_CARD.filter(isReadOnly)).toEqual([
      GOOGLE_VIDEO,
      TIKTOK_ATTRIBUTION_WINDOW,
      GOOGLE_DELIVERY_ACCOUNT_WIDE,
      TIKTOK_DELIVERY,
    ]);
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

describe('Google negative terms', () => {
  it('lists each term with spend, clicks and conversions, and what the negatives stop', () => {
    const { getByRole, getAllByTestId, getByTestId } = render(
      <PlatformCardBody card={GOOGLE_NEGATIVE_TERMS} onAddNegatives={() => {}} />,
    );
    expect(getByRole('heading').textContent).toBe(
      '3 search terms in Search | Leads MX spent 478 MXN in 14 days without a conversion',
    );
    const rows = getAllByTestId('platform-card-term').map((row) => row.textContent);
    expect(rows).toEqual([
      '"free gym"214 MXN380',
      '"gym jobs"168 MXN290',
      '"gym near me cheap"96.00 MXN170',
    ]);
    expect(getByTestId('platform-card-negatives').textContent).toBe(
      'Adding them as exact negatives stops about 34.14 MXN/day.',
    );
    expect(getByTestId('platform-card-mark').getAttribute('data-platform')).toBe('google_ads');
  });

  it('adds every term at once, or the ones chosen in the review step', () => {
    const added: string[][] = [];
    const { getByTestId, getAllByTestId, queryByTestId } = render(
      <PlatformCardBody
        card={GOOGLE_NEGATIVE_TERMS}
        onAddNegatives={(terms) => added.push(terms)}
      />,
    );
    expect(getByTestId('platform-card-add-negatives').textContent).toBe('Add 3 negatives');
    fireEvent.click(getByTestId('platform-card-add-negatives'));
    expect(added).toEqual([['free gym', 'gym jobs', 'gym near me cheap']]);

    fireEvent.click(getByTestId('platform-card-choose-terms'));
    expect(queryByTestId('platform-card-add-negatives')).toBeNull();
    fireEvent.click(getAllByTestId('negative-terms-review-checkbox')[1] as HTMLElement);
    expect(getByTestId('negative-terms-review-confirm').textContent).toBe('Add 2 negatives');
    fireEvent.click(getByTestId('negative-terms-review-confirm'));
    expect(added[1]).toEqual(['free gym', 'gym near me cheap']);
    expect(queryByTestId('negative-terms-review')).toBeNull();
  });

  it('offers no buttons when the caller has nowhere to approve them', () => {
    const { queryByTestId } = render(<PlatformCardBody card={GOOGLE_NEGATIVE_TERMS} />);
    expect(queryByTestId('platform-card-add-negatives')).toBeNull();
    expect(queryByTestId('platform-card-choose-terms')).toBeNull();
  });
});

describe('Google promote term', () => {
  it('says what the term brought and the keyword it comes in through', () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={GOOGLE_PROMOTE_TERM} />);
    expect(getByRole('heading').textContent).toBe(
      '"24 hour gym guadalajara" brought 19 conversions at 22.10 MXN in 14 days and is not a keyword yet',
    );
    expect(getByTestId('platform-card-promote').textContent).toBe(
      'It comes in through "gym guadalajara". As an exact keyword in "Locations" it gets its own bid and its own ad.',
    );
    expect(platformCardActionLabel(GOOGLE_PROMOTE_TERM)).toBe('Add as exact keyword');
  });
});

describe('Google bid target', () => {
  it('shows the current target, the actual cost and the proposal, with the cooldown in words', () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={GOOGLE_BID_TARGET} />);
    expect(getByRole('heading').textContent).toBe(
      'Search | Leads MX: target CPA 35.00 MXN, actual 31.40 MXN over 14 days',
    );
    expect(getByTestId('platform-card-bid').textContent).toBe(
      'Current target35.00 MXNActual, 14 days31.40 MXNProposed32.00 MXN',
    );
    expect(getByTestId('platform-card-cooldown').textContent).toBe(
      'The target last changed 3 days ago. Google is still relearning, so wait 4 more days before changing it again.',
    );
    expect(platformCardActionLabel(GOOGLE_BID_TARGET)).toBe('Lower the target CPA to 32.00 MXN');
  });

  it('reads a target ROAS as a percentage and says when the cooldown is over', () => {
    const roas = PlatformCardSchema.parse({
      ...GOOGLE_BID_TARGET,
      strategy: 'target_roas',
      current_target: 3,
      actual: 3.6,
      proposed_target: 3.4,
      days_since_last_change: 12,
    });
    expect(platformCardTitle(roas)).toBe(
      'Search | Leads MX: target ROAS 300%, actual 360% over 14 days',
    );
    expect(platformCardActionLabel(roas)).toBe('Raise the target ROAS to 340%');
    expect(bidCooldownNote(12)).toBe(
      "The target last changed 12 days ago, past Google's 7-day relearning period.",
    );
    expect(bidCooldownNote(null)).toStartWith('No recent bid change on record.');
  });
});

describe('Google low-quality keyword', () => {
  it('shows the Quality Score as n/10 and what the keyword spent', () => {
    const { getByRole, getByTestId } = render(
      <PlatformCardBody card={GOOGLE_LOW_QUALITY_KEYWORD} />,
    );
    expect(getByRole('heading').textContent).toBe(
      '"fitness classes" has Quality Score 3/10 and spent 412 MXN in 14 days with 0 conversions',
    );
    expect(getByTestId('platform-card-quality').textContent).toContain(
      'Phrase match in ad group "Generic" · Quality Score 3/10.',
    );
    expect(platformCardActionLabel(GOOGLE_LOW_QUALITY_KEYWORD)).toBe('Pause keyword');
  });
});

describe('TikTok hook retention', () => {
  it('compares the 2-second hold against the portfolio', () => {
    const { getByRole, getByTestId } = render(<PlatformCardBody card={TIKTOK_HOOK_RETENTION} />);
    expect(getByRole('heading').textContent).toBe(
      '"Studio tour" holds 18% of viewers past 2 seconds, against 34% across the portfolio',
    );
    expect(getByTestId('platform-card-hook').textContent).toContain(
      '2-second hold 18% against 34% for the portfolio, over 42,100 impressions in 6 days',
    );
    expect(getByTestId('platform-card-mark').getAttribute('data-platform')).toBe('tiktok_ads');
    expect(platformCardActionLabel(TIKTOK_HOOK_RETENTION)).toBe('Request a new opening');
  });
});

describe('TikTok Spark candidate', () => {
  it("shows the post's views and engagement and asks for the creator's code", () => {
    const { getByRole, getByTestId, container } = render(
      <PlatformCardBody card={TIKTOK_SPARK_CANDIDATE} />,
    );
    expect(getByRole('heading').textContent).toBe(
      'An organic post has 48,000 views and 3.4% engagement, and is not promoted',
    );
    expect(getByTestId('platform-card-spark').textContent).toBe(
      '"Morning class in 30 seconds" · 48,000 views · 3.4% engagement · better than 92% of the account\'s posts · would run in "Leads MX · Spark"',
    );
    expect(container.textContent).toContain("creator's authorization code");
    expect(platformCardActionLabel(TIKTOK_SPARK_CANDIDATE)).toBe('Request the Spark code');
  });
});

describe('TikTok budget below learning', () => {
  it('states the documented multiple and the budget it implies', () => {
    const { getByRole, getByTestId } = render(
      <PlatformCardBody card={TIKTOK_BUDGET_BELOW_LEARNING} />,
    );
    expect(getByRole('heading').textContent).toBe(
      'Leads MX · Broad: budget 300 MXN/day, under the 900 MXN/day learning needs',
    );
    expect(getByTestId('platform-card-learning').textContent).toBe(
      'TikTok documents a daily budget of 20× the cost per result for this goal; at 45.00 MXN per result that is 900 MXN/day. 4 results so far.',
    );
    expect(platformCardActionLabel(TIKTOK_BUDGET_BELOW_LEARNING)).toBe(
      'Raise the budget to 900 MXN/day',
    );
  });
});

describe('TikTok attribution window', () => {
  it('says why the platforms are not compared and offers nothing to apply', () => {
    const { getByRole, getByTestId } = render(
      <PlatformCardBody card={TIKTOK_ATTRIBUTION_WINDOW} />,
    );
    expect(getByRole('heading').textContent).toBe(
      'Leads MX · Spark counts 28-day click / 1-day view, Meta counts 7-day click / 1-day view',
    );
    expect(getByTestId('platform-card-attribution').textContent).toContain(
      'so we do not compare these platforms until the windows match',
    );
    expect(platformCardActionLabel(TIKTOK_ATTRIBUTION_WINDOW)).toBeNull();
    expect(isReadOnly(TIKTOK_ATTRIBUTION_WINDOW)).toBe(true);
  });
});

describe('every variant', () => {
  it('has a platform, a type label, and no chart', () => {
    for (const card of EVERY_CARD) {
      expect(platformsOf(card).length).toBeGreaterThan(0);
      expect(PLATFORM_CARD_TYPE[card.variant]).toBeTruthy();
      const { container, unmount } = render(<PlatformCardBody card={card} />);
      expect(container.querySelector('svg.recharts-surface, canvas')).toBeNull();
      unmount();
    }
  });

  it('marks only the new variants with the platform mark', () => {
    const marked = EVERY_CARD.filter((card) => markedPlatformOf(card) !== null).map(
      (card) => card.variant,
    );
    expect(marked).toEqual([
      'google_negative_terms',
      'google_promote_term',
      'google_bid_target',
      'google_low_quality_keyword',
      'tiktok_hook_retention',
      'tiktok_spark_candidate',
      'tiktok_budget_below_learning',
      'tiktok_attribution_window',
      'google_delivery_issue',
      'tiktok_delivery_issue',
    ]);
  });
});

describe('Google delivery issue', () => {
  it("quotes Google's reasons in plain words and names one cause for the whole account", () => {
    const { getByRole, getByTestId, queryByRole } = render(
      <PlatformCardBody card={GOOGLE_DELIVERY_ACCOUNT_WIDE} />,
    );
    expect(getByRole('heading').textContent).toBe(
      'No campaign in the account has served for 6 days: one cause for the whole account',
    );
    expect(getByTestId('platform-card-delivery').textContent).toBe(
      'Google says: ads disapproved by policy; limited by budget. 3 ads disapproved. Budget 500 MXN/day.',
    );
    expect(getByTestId('platform-card-account-wide').textContent).toContain(
      'one cause for the whole account',
    );
    const link = getByTestId('platform-card-open-google');
    expect(link.textContent).toBe('Open in Google Ads');
    expect(link.getAttribute('href')).toBe('https://ads.google.com/aw/policymanager');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(queryByRole('button')).toBeNull();
    expect(isReadOnly(GOOGLE_DELIVERY_ACCOUNT_WIDE)).toBe(true);
    expect(platformCardActionLabel(GOOGLE_DELIVERY_ACCOUNT_WIDE)).toBeNull();
    expect(platformsOf(GOOGLE_DELIVERY_ACCOUNT_WIDE)).toEqual(['google_ads']);
  });

  it('names the one campaign when the account is not dark, and reads a code it does not know', () => {
    const { getByRole, getByTestId, queryByTestId } = render(
      <PlatformCardBody card={GOOGLE_DELIVERY_ONE_CAMPAIGN} />,
    );
    expect(getByRole('heading').textContent).toBe('PMax Necesidades SLP has not served for 1 day');
    expect(getByTestId('platform-card-delivery').textContent).toBe(
      'Google says: no asset groups; some new reason.',
    );
    expect(queryByTestId('platform-card-account-wide')).toBeNull();
    expect(getByTestId('platform-card-open-google').getAttribute('href')).toBe(
      'https://ads.google.com/aw/campaigns',
    );
    expect(googleReasonInWords('BUDGET_CONSTRAINED')).toBe('limited by budget');
    expect(googleReasonInWords('HAS_ADS_DISAPPROVED')).not.toContain('_');
  });
});

describe('TikTok delivery issue', () => {
  it("quotes TikTok's review reasons and its suggestion, and offers nothing to apply", () => {
    const { getByRole, getAllByTestId, queryByRole } = render(
      <PlatformCardBody card={TIKTOK_DELIVERY} />,
    );
    expect(getByRole('heading').textContent).toBe(
      'EF | Leads | Intereses fitness has not served for 3 days: rejected in review',
    );
    const rows = getAllByTestId('platform-card-rejection').map((row) => row.textContent);
    expect(rows).toEqual([
      'TikTok\'s review: "Exaggerated or misleading claims", "Before-and-after imagery". Its suggestion: "Remove the before-and-after frames and resubmit the ad."',
      'TikTok\'s review: "Unclear landing page".',
    ]);
    expect(queryByRole('button')).toBeNull();
    expect(isReadOnly(TIKTOK_DELIVERY)).toBe(true);
    expect(platformsOf(TIKTOK_DELIVERY)).toEqual(['tiktok_ads']);
    expect(PLATFORM_CARD_TYPE.tiktok_delivery_issue).toBe('Delivery');
  });

  it('says TikTok gave no reason when there is no rejection, and reads an unknown status', () => {
    const card = PlatformCardSchema.parse({
      ...TIKTOK_DELIVERY,
      secondary_status: 'ADGROUP_STATUS_SOMETHING_NEW',
      dark_days: 0,
      rejected_ads: [],
    });
    const { getByRole, getByTestId } = render(<PlatformCardBody card={card} />);
    expect(getByRole('heading').textContent).toBe(
      'EF | Leads | Intereses fitness is not serving: something new',
    );
    expect(getByTestId('platform-card-delivery').textContent).toContain(
      'TikTok gives no review reason',
    );
    expect(tiktokStatusInWords('ADGROUP_STATUS_BUDGET_EXCEED')).toBe('out of budget');
  });
});
