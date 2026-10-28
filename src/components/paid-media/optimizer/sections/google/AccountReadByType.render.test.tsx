import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, within } from '@testing-library/react';
import { AMBIGUOUS, EMPTY, GOALS, WITH_E1 } from './__fixtures__/googleTab';
import { AccountReadByType } from './AccountReadByType';
import { campaignViews, typeRows } from './campaignExplorerModel';

afterEach(cleanup);

const mount = (read: typeof WITH_E1, goals = GOALS) =>
  render(
    <AccountReadByType currency="MXN" rows={typeRows(campaignViews(read, goals, 'MXN'), 'MXN')} />,
  );

const cells = (row: Element) => [...row.querySelectorAll('td')].map((cell) => cell.textContent);

describe('AccountReadByType', () => {
  it("says each type's cost against its portfolio goal in one line, the table behind a disclosure", () => {
    const { getByTestId } = mount(WITH_E1);
    expect(getByTestId('google-account-by-type-summary').textContent).toBe(
      'Search: $1,315 MXN per conversion · 46% over goal; Display: $119 MXN per conversion · no target.',
    );
    const section = getByTestId('google-account-by-type');
    expect(section.querySelector('details')?.open).toBe(false);
    const rows = within(section).getAllByTestId('google-by-type-row');
    expect(cells(rows[0] as Element)).toEqual([
      'Search3 campaigns',
      '$44,713',
      '81%',
      '34',
      '$1,315',
      '$900',
      '46% over goal',
    ]);
    expect(cells(rows[1] as Element).slice(5)).toEqual([
      '— No portfolio holds it',
      'no targetNo portfolio holds it',
    ]);
    expect(cells(getByTestId('google-by-type-total')).slice(0, 5)).toEqual([
      'All campaigns',
      '$55,205',
      '100%',
      '122',
      '$453',
    ]);
    expect(
      within(section)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toContain('Spend · MXN');
  });

  it('shows "—" with its reason when the account has no single result', () => {
    const { getByTestId } = mount(AMBIGUOUS);
    const [search] = within(getByTestId('google-by-type-table')).getAllByTestId(
      'google-by-type-row',
    );
    const dashes = within(search as HTMLElement).getAllByTestId('missing');
    expect(dashes.map((dash) => dash.getAttribute('data-reason'))).toContain(
      'No single result defined',
    );
    expect(getByTestId('google-account-by-type-summary').textContent).toContain(
      'Search: conversions not counted',
    );
  });

  it('says no campaign spent, and draws no table, on an empty read', () => {
    const { getByTestId, queryByTestId } = mount(EMPTY, new Map());
    expect(getByTestId('google-account-by-type-summary').textContent).toBe(
      'No campaign spent in the window.',
    );
    expect(queryByTestId('google-by-type-table')).toBeNull();
  });
});
