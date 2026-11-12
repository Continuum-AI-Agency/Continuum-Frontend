import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AdAccountBoardSlot, BoardModuleId, BoardModuleSize } from '@continuum/contracts';
import { readAdAccount } from '@continuum/contracts';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import type { BoardContext } from '../../types';
import {
  EASY_FIT_META_ACCOUNT,
  EASY_FIT_META_BRAND,
  PORTFOLIOS,
  ROSTERS,
  TOP_ADSETS,
  TOP_CAMPAIGNS,
} from './__fixtures__/easyFitMeta';
import { type MetaRankRow, rankRowOf } from './metaLensModel';
import type { MetaReadState } from './metaReads';

// Every read the four views make is driven from these handles. `mock.module` replaces a module
// for the whole process, so the real one is spread under the overrides and this file runs on
// its own.
const ready = (rows: MetaRankRow[]): MetaReadState<MetaRankRow[]> => ({
  status: 'ready',
  data: rows,
});
let campaignsRead: MetaReadState<MetaRankRow[]> = { status: 'loading' };
let adsetsRead: MetaReadState<MetaRankRow[]> = { status: 'loading' };
const asked: string[] = [];
const realReads = await import('./metaReads');
mock.module('./metaReads', () => ({
  ...realReads,
  useMetaRanking: (_brandId: string, accountId: string | null, scope: string) => {
    asked.push(`${scope}:${accountId}`);
    return scope === 'top_campaigns' ? campaignsRead : adsetsRead;
  },
  useCampaignAds: () => ({ status: 'no-account' }),
  usePortfolioRosters: () => ({
    rosters: new Map(Object.entries(ROSTERS)),
    failed: [],
  }),
}));
const realData = await import('../../../../useOptimizerData');
mock.module('../../../../useOptimizerData', () => ({
  ...realData,
  useOptimizerAdAccounts: () => ({
    data: [
      {
        platform: 'meta_ads',
        account_id: EASY_FIT_META_ACCOUNT,
        name: 'Easy Fit',
        status: 'active',
        currency: 'MXN',
      },
    ],
  }),
}));

const { default: BranchesLens } = await import('./BranchesLens');
const { default: HeadroomLens } = await import('./HeadroomLens');
const { default: EventsLens } = await import('./EventsLens');
const { default: StructureMap } = await import('./StructureMap');

afterEach(() => {
  cleanup();
  asked.length = 0;
  campaignsRead = { status: 'loading' };
  adsetsRead = { status: 'loading' };
});

const ctx: BoardContext = {
  brandId: EASY_FIT_META_BRAND,
  platform: 'meta',
  adAccountId: EASY_FIT_META_ACCOUNT,
  currency: 'MXN',
  portfolios: PORTFOLIOS,
  reading: readAdAccount({
    platform: 'meta',
    portfolios: [],
    approvalRequired: false,
    currency: 'MXN',
  }),
  onOpenActions: () => undefined,
  onOpenActivity: () => undefined,
  onSelectPortfolio: () => undefined,
  onCreatePortfolio: () => undefined,
};

const slot = (module: BoardModuleId, size: BoardModuleSize = 'm'): AdAccountBoardSlot => ({
  module,
  size,
  score: 80,
  reason: 'Una campaña por sucursal.',
});

describe('the Meta views in their frames', () => {
  it('hold their footprint with a skeleton while the campaigns read', () => {
    render(<BranchesLens ctx={ctx} slot={slot('branches')} />);
    const frame = screen.getByTestId('board-module-branches');
    expect(within(frame).getByRole('heading', { name: 'Branches' })).toBeTruthy();
    expect(within(frame).getByText('Meta')).toBeTruthy();
    expect(screen.getByTestId('board-module-branches-reason').textContent).toBe(
      'Una campaña por sucursal.',
    );
    expect(screen.getByTestId('board-module-branches-loading')).toBeTruthy();
    expect(frame.getAttribute('data-module-state')).toBe('loading');
    expect(asked).toContain(`top_campaigns:${EASY_FIT_META_ACCOUNT}`);
  });

  it('say the read failed and ask again', () => {
    const retry = mock(() => undefined);
    campaignsRead = { status: 'error', retry };
    render(<HeadroomLens ctx={ctx} slot={slot('headroom')} />);
    expect(screen.getByTestId('board-module-headroom-error').textContent).toContain(
      'The campaigns could not be read.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('board-module-headroom').getAttribute('data-module-state')).toBe(
      'error',
    );
  });

  it('say there is no Meta account to read', () => {
    campaignsRead = { status: 'no-account' };
    render(<BranchesLens ctx={{ ...ctx, adAccountId: null }} slot={slot('branches', 's')} />);
    expect(screen.getByTestId('board-module-branches-empty').textContent).toBe(
      'Select a Meta ad account to read its campaigns.',
    );
    expect(screen.getByTestId('board-module-branches').getAttribute('data-module-state')).toBe(
      'missing',
    );
  });

  it('draw the branches and the headroom from the same campaign read', () => {
    campaignsRead = ready(TOP_CAMPAIGNS.map(rankRowOf));
    render(
      <>
        <BranchesLens ctx={ctx} slot={slot('branches')} />
        <HeadroomLens ctx={ctx} slot={slot('headroom', 'l')} />
      </>,
    );
    expect(screen.getAllByTestId('board-module-branches-row')).toHaveLength(5);
    expect(screen.getAllByTestId('board-module-headroom-point')).toHaveLength(5);
    const headroom = screen.getByTestId('board-module-headroom');
    expect(headroom.getAttribute('data-size')).toBe('l');
    // Ready, with the window said in each body: the result module beside them reads 7 days.
    for (const id of ['branches', 'headroom']) {
      expect(screen.getByTestId(`board-module-${id}`).getAttribute('data-module-state')).toBe(
        'ready',
      );
      expect(screen.getByTestId(`board-module-${id}-window`).textContent).toMatch(/^Last 30 days/);
    }
  });

  it('name the events while the value is still reading', () => {
    render(<EventsLens ctx={ctx} slot={slot('events')} />);
    expect(screen.getAllByTestId('board-module-events-event')).toHaveLength(3);
    expect(screen.getByText('Reading what each event is worth…')).toBeTruthy();
    expect(screen.getByTestId('board-module-events').getAttribute('data-module-state')).toBe(
      'loading',
    );
  });

  it('wait for the ad sets before drawing the structure, then root it at the account', () => {
    campaignsRead = ready(TOP_CAMPAIGNS.map(rankRowOf));
    const { rerender } = render(<StructureMap ctx={ctx} slot={slot('structure', 'l')} />);
    expect(screen.getByTestId('board-module-structure-loading')).toBeTruthy();
    expect(screen.getByTestId('board-module-structure').getAttribute('data-module-state')).toBe(
      'loading',
    );
    adsetsRead = ready(TOP_ADSETS.map(rankRowOf));
    rerender(<StructureMap ctx={ctx} slot={slot('structure', 'l')} />);
    const root = screen
      .getAllByTestId('board-module-structure-node')
      .find((node) => node.getAttribute('data-level') === 'root');
    expect(root?.getAttribute('aria-label')).toBe('Easy Fit');
    expect(screen.getByTestId('board-module-structure-takeaway').textContent).toContain(
      'Los portafolios manejan el 80% del gasto de 30 días',
    );
    expect(screen.getByTestId('board-module-structure').getAttribute('data-module-state')).toBe(
      'ready',
    );
  });
});
