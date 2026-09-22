import { describe, expect, it } from 'bun:test';
import type { NewsCardModel } from './justification';
import { pickJustification } from './justification';

const card = (over: Partial<NewsCardModel> = {}): NewsCardModel => ({
  id: 'c1',
  eyebrow: 'Budget',
  claim: 'Move $66/day onto the cheaper ad set.',
  reason: null,
  headline: null,
  moneyPerDay: 14,
  impactPerDay: 14,
  basis: null,
  chosenOver: null,
  interval: null,
  cappedBy: null,
  cta: null,
  ...over,
});

describe('pickJustification', () => {
  it('shows the arithmetic when the card holds the pair', () => {
    expect(
      pickJustification(
        card({
          headline: {
            kind: 'money',
            value: 66,
            unit: 'currency_per_day',
            label: 'a day moved onto it',
            from: 120,
            to: 186,
          },
        }),
      ),
    ).toBe('arithmetic');
  });

  it('needs BOTH sides of the pair — half a pair is not an arithmetic', () => {
    const half = card({
      headline: {
        kind: 'money',
        value: 66,
        unit: 'currency_per_day',
        label: 'a day moved onto it',
        from: 120,
        to: null,
      },
    });
    expect(pickJustification(half)).toBe('open');
  });

  it('is bounded when there is a range WITH a point estimate inside it', () => {
    expect(
      pickJustification(
        card({
          interval: { low: 96, high: 190, estimate: 140, referenceLabel: 'target', reference: 70 },
        }),
      ),
    ).toBe('bounded');
  });

  it('will not borrow the bounded layout for a range with no point estimate', () => {
    // Zero conversions in the window: a floor, and nothing above it ruled out. There is no
    // centre to draw, so the card must not draw one.
    expect(
      pickJustification(
        card({
          interval: { low: 96, high: 192, estimate: null, referenceLabel: 'target', reference: 70 },
        }),
      ),
    ).toBe('open');
  });

  it('prefers the pair over the range when the card holds both', () => {
    expect(
      pickJustification(
        card({
          headline: {
            kind: 'money',
            value: 66,
            unit: 'currency_per_day',
            label: 'a day moved onto it',
            from: 120,
            to: 186,
          },
          interval: { low: 96, high: 190, estimate: 140, referenceLabel: null, reference: null },
        }),
      ),
    ).toBe('arithmetic');
  });

  it('falls to open when the card holds neither', () => {
    expect(pickJustification(card())).toBe('open');
  });

  it('does not let a cap choose the layout — a cap is a footnote, not a shape', () => {
    const capped = card({
      cappedBy: 'Capped by this objective’s per-cycle velocity band',
      headline: {
        kind: 'money',
        value: 66,
        unit: 'currency_per_day',
        label: 'a day moved onto it',
        from: 120,
        to: 186,
      },
    });
    expect(pickJustification(capped)).toBe('arithmetic');
  });
});
