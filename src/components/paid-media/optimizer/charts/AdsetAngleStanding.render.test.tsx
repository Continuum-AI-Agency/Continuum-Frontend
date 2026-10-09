import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { AdsetAngleStanding } from './AdsetAngleStanding';
import type { AdsetAngleRow } from './angleStanding';

afterEach(cleanup);

const candidate = (value: string) => ({
  value,
  winRate: 0.7,
  eligibleAds: 4,
  spendShare: 0.5,
  spend: 1200,
});

const row = (adsetId: string, verdict: AdsetAngleRow['verdict']): AdsetAngleRow => ({
  adsetId,
  adsetName: `Ad set ${adsetId}`,
  currentAngle: candidate('offer_discount'),
  recommendedAngle: verdict === 'insufficient' ? null : candidate('social_proof_peer'),
  verdict,
  action: verdict === 'insufficient' ? 'Ship a second variant.' : 'Make two more testimonials.',
  confidence: verdict === 'insufficient' ? 'thin' : 'proven',
  adsetMedianCpa: 80,
  kpi: 'lead',
});

describe('AdsetAngleStanding', () => {
  it('lists the ad sets with a call and folds the thin ones into one line', () => {
    const { getByTestId, getByText, queryAllByText } = render(
      <AdsetAngleStanding
        currency="MXN"
        rows={[row('a', 'double_down'), row('b', 'insufficient'), row('c', 'insufficient')]}
      />,
    );
    expect(getByText('1 of 3 ad sets have a clear next angle')).toBeTruthy();
    const fold = getByTestId('angle-standing-thin');
    expect(fold.hasAttribute('open')).toBe(false);
    expect(fold.textContent).toContain(
      '2 ad sets need a second variant before an angle can be called',
    );
    // The thin rows exist only inside the fold, never in the main list.
    expect(queryAllByText('Ship a second variant.').every((el) => fold.contains(el))).toBe(true);
  });

  it('renders no fold when every ad set has a call', () => {
    const { queryByTestId } = render(
      <AdsetAngleStanding currency="MXN" rows={[row('a', 'double_down')]} />,
    );
    expect(queryByTestId('angle-standing-thin')).toBeNull();
  });
});
