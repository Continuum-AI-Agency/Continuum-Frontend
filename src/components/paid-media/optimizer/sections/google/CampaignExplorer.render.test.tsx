import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { BEFORE_E1, EKATAR, EMPTY, GOALS, WITH_E1 } from './__fixtures__/googleTab';
import { CampaignExplorer } from './CampaignExplorer';
import { campaignViews } from './campaignExplorerModel';
import { NOT_IN_THIS_READ } from './googleReads';

afterEach(cleanup);

const mount = (read: typeof WITH_E1, goals = GOALS, onOpenCampaign = mock()) =>
  Object.assign(
    render(
      <CampaignExplorer
        currency="MXN"
        onOpenCampaign={onOpenCampaign}
        rows={campaignViews(read, goals, 'MXN')}
      />,
    ),
    { onOpenCampaign },
  );

describe('CampaignExplorer', () => {
  it('names the pattern in one line and keeps the scatter and table behind a disclosure', () => {
    const { getByTestId } = mount(WITH_E1);
    expect(getByTestId('google-campaign-explorer-summary').textContent).toBe(
      '2 of 7 campaigns pay over their goal, with 73% of the $55,205 MXN spent.',
    );
    expect(getByTestId('google-campaign-explorer').querySelector('details')?.open).toBe(false);
  });

  it('draws one dot per priced campaign, the goal as a dashed line, and the same rows as a table', () => {
    const { getByTestId, getAllByTestId } = mount(WITH_E1);
    // Remarketing Gourmetería spent without a conversion: it has no cost to plot.
    expect(getAllByTestId('google-explorer-dot')).toHaveLength(6);
    expect(getByTestId('google-explorer-goal-line').getAttribute('stroke-dasharray')).toBe('4 3');
    const rows = getAllByTestId('google-explorer-row');
    expect(rows).toHaveLength(7);
    const first = rows[0] as HTMLElement;
    expect(first.getAttribute('data-campaign-id')).toBe(EKATAR);
    expect([...first.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      'VIVO 47-EKATARSearch · Active',
      '$36,997',
      '26',
      '$1,422',
      '58% over goal',
      '28%',
      '30%',
    ]);
  });

  it('opens a campaign from its name', () => {
    const { getAllByTestId, onOpenCampaign } = mount(WITH_E1);
    fireEvent.click(
      within(getAllByTestId('google-explorer-row')[0] as HTMLElement).getByRole('button'),
    );
    expect(onOpenCampaign).toHaveBeenCalledWith(EKATAR);
  });

  it('shows "—" with its reason for every share a pre-E1 payload does not carry', () => {
    const { getAllByTestId, getByTestId } = mount(BEFORE_E1);
    const first = getAllByTestId('google-explorer-row')[0] as HTMLElement;
    const reasons = within(first)
      .getAllByTestId('missing')
      .map((dash) => dash.getAttribute('data-reason'));
    expect(reasons).toEqual([NOT_IN_THIS_READ, NOT_IN_THIS_READ, NOT_IN_THIS_READ]);
    expect(getByTestId('missing-reasons').textContent).toContain(NOT_IN_THIS_READ);
  });

  it('says there is no target when no portfolio holds a campaign, and nothing spent when empty', () => {
    expect(
      mount(WITH_E1, new Map()).getByTestId('google-campaign-explorer-summary').textContent,
    ).toBe('7 campaigns spent $55,205 MXN; no portfolio holds them, so none has a target.');
    cleanup();
    const empty = mount(EMPTY, new Map());
    expect(empty.getByTestId('google-campaign-explorer-summary').textContent).toBe(
      'No campaign spent in the window.',
    );
    expect(empty.queryByTestId('google-explorer-table')).toBeNull();
  });
});
