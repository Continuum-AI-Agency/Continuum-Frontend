import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { GOOGLE_NEGATIVE_TERMS } from '../platformCards/__fixtures__/platformCards';
import { NegativeTermsReview } from './NegativeTermsReview';
import { allChosen, chosenSpend, chosenTerms, toggleTerm } from './negativeTermsReviewModel';

afterEach(cleanup);

if (GOOGLE_NEGATIVE_TERMS.variant !== 'google_negative_terms') throw new Error('fixture');
const TERMS = GOOGLE_NEGATIVE_TERMS.terms;

function view() {
  const confirmed: string[][] = [];
  let cancelled = 0;
  const utils = render(
    <NegativeTermsReview
      currency="MXN"
      onCancel={() => {
        cancelled += 1;
      }}
      onConfirm={(terms) => confirmed.push(terms)}
      terms={TERMS}
      windowDays={14}
    />,
  );
  return { ...utils, confirmed, cancelled: () => cancelled };
}

describe('NegativeTermsReview', () => {
  it('starts with every term chosen and says what they spent', () => {
    const { getAllByTestId, getByTestId } = view();
    expect(getAllByTestId('negative-terms-review-checkbox')).toHaveLength(3);
    expect(getByTestId('negative-terms-review-confirm').textContent).toBe('Add 3 negatives');
    expect(getByTestId('negative-terms-review-spend').textContent).toBe(
      'The chosen terms spent 478 MXN in 14 days.',
    );
  });

  it('narrows the list as terms are unticked, and confirms the ones kept in order', () => {
    const { getAllByTestId, getByTestId, confirmed } = view();
    const rows = getAllByTestId('negative-terms-review-checkbox');
    fireEvent.click(rows[0] as HTMLElement);
    expect(getByTestId('negative-terms-review-confirm').textContent).toBe('Add 2 negatives');
    expect(getByTestId('negative-terms-review-spend').textContent).toBe(
      'The chosen terms spent 264 MXN in 14 days.',
    );
    fireEvent.click(getByTestId('negative-terms-review-confirm'));
    expect(confirmed).toEqual([['gym jobs', 'gym near me cheap']]);
  });

  it('cannot confirm with nothing chosen, and says one negative in the singular', () => {
    const { getAllByTestId, getByTestId, getByText, cancelled } = view();
    const rows = getAllByTestId('negative-terms-review-checkbox');
    fireEvent.click(rows[0] as HTMLElement);
    fireEvent.click(rows[1] as HTMLElement);
    expect(getByTestId('negative-terms-review-confirm').textContent).toBe('Add 1 negative');
    fireEvent.click(rows[2] as HTMLElement);
    expect(getByTestId('negative-terms-review-confirm').hasAttribute('disabled')).toBe(true);
    fireEvent.click(getByText('Cancel'));
    expect(cancelled()).toBe(1);
  });

  it('keeps selection pure', () => {
    const start = allChosen(TERMS);
    const without = toggleTerm(start, 'gym jobs');
    expect(start.size).toBe(3);
    expect(chosenTerms(TERMS, without)).toEqual(['free gym', 'gym near me cheap']);
    expect(chosenSpend(TERMS, without)).toBe(310);
    expect(chosenTerms(TERMS, toggleTerm(without, 'gym jobs'))).toEqual(TERMS.map((t) => t.term));
  });
});
