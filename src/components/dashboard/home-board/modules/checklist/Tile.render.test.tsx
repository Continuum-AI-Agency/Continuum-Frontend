import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { PortfolioListItem, RecommendationRow } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { homeContext, tileOf } from '../opps/__fixtures__/homeContext';
import {
  EASY_FIT_PORTFOLIOS,
  PINK_ELEPHANT_BRAND_ID,
  PINK_ELEPHANT_PORTFOLIOS,
} from '../opps/__fixtures__/portfolios';
import { PINK_ELEPHANT_RECOMMENDATIONS } from './__fixtures__/recommendations';

// `mock.module` replaces a module for the whole process, so this file runs on its own; every mock
// spreads the real module.
type PortfoliosRead = {
  hasAnswer: boolean;
  isError: boolean;
  brandPortfolios: PortfolioListItem[];
};
let portfoliosRead: PortfoliosRead = {
  hasAnswer: true,
  isError: false,
  brandPortfolios: PINK_ELEPHANT_PORTFOLIOS,
};
let recommendations: RecommendationRow[] = PINK_ELEPHANT_RECOMMENDATIONS;
const performanceReads: string[] = [];
// React Query hands back the same report object until it refetches; so does this mock.
const reports = new Map<RecommendationRow[], unknown>();
const reportOf = (recs: RecommendationRow[]) => {
  if (!reports.has(recs)) {
    reports.set(recs, {
      portfolio: null,
      latest_run: null,
      latest_items: [],
      recommendations: recs,
      history: [],
    });
  }
  return reports.get(recs);
};
const refetch = mock(() => Promise.resolve());
const realData = await import('@/components/paid-media/optimizer/useOptimizerData');
mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  ...realData,
  useOptimizerPortfolios: () => ({
    ...portfoliosRead,
    data: portfoliosRead.brandPortfolios,
    refetch,
  }),
  useOptimizerPerformance: (portfolioId: string | null) => {
    if (portfolioId) performanceReads.push(portfolioId);
    return { data: reportOf(recommendations), isSuccess: true, isError: false, refetch };
  },
}));

// The report email is the existing dialog, used as is; here a stub says it opened for the brand.
const realDialog = await import('@/components/dashboard/SendContinuumReportDialog');
mock.module('@/components/dashboard/SendContinuumReportDialog', () => ({
  ...realDialog,
  SendContinuumReportDialog: (props: { brandId: string; open: boolean }) =>
    props.open ? <div data-brand={props.brandId} data-testid="report-email-dialog" /> : null,
}));

const { default: ChecklistTile } = await import('./Tile');
const { CHECKLIST_MISSING, EMAIL_NOTE } = await import('./checklistModel');

afterEach(() => {
  cleanup();
  portfoliosRead = { hasAnswer: true, isError: false, brandPortfolios: PINK_ELEPHANT_PORTFOLIOS };
  recommendations = PINK_ELEPHANT_RECOMMENDATIONS;
  performanceReads.length = 0;
  refetch.mockClear();
});

const frame = () => screen.getByTestId('home-tile-checklist');
const ctx = homeContext(PINK_ELEPHANT_BRAND_ID, 'recommend');

describe('Client checklist tile', () => {
  it('headlines the open items with the raw count, from the portfolio list alone', () => {
    render(<ChecklistTile ctx={ctx} tile={tileOf('checklist', 'l')} />);
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-checklist-headline');
    expect(headline.getAttribute('data-value')).toBe('9');
    // The tile mounts no per-portfolio read: the items load when the checklist is opened.
    expect(performanceReads).toEqual([]);
  });

  it('lists its portfolios as padded links in a column', () => {
    render(<ChecklistTile ctx={ctx} tile={tileOf('checklist', 'l')} />);
    const list = screen.getByTestId('home-tile-checklist-portfolios');
    expect(list.className.split(/\s+/)).toContain('hit-area-column');
    const [link] = within(list).getAllByRole('link');
    expect(link?.className.split(/\s+/)).toContain('hit-area');
    expect(link?.textContent).toBe('Evento Webinar 29 Octubre');
  });

  it('is missing when no portfolio recommends changes for the client', () => {
    portfoliosRead = { ...portfoliosRead, brandPortfolios: EASY_FIT_PORTFOLIOS };
    render(<ChecklistTile ctx={ctx} tile={tileOf('checklist')} />);
    expect(frame().getAttribute('data-module-state')).toBe('missing');
    expect(screen.getByTestId('home-tile-missing').textContent).toBe(CHECKLIST_MISSING);
    expect(screen.queryByTestId('home-tile-checklist-headline')).toBeNull();
  });

  it('is an error with a Retry when the portfolio read failed', () => {
    portfoliosRead = { hasAnswer: false, isError: true, brandPortfolios: [] };
    render(<ChecklistTile ctx={ctx} tile={tileOf('checklist')} />);
    expect(frame().getAttribute('data-module-state')).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Client checklist expanded', () => {
  async function openChecklist() {
    render(<ChecklistTile ctx={ctx} tile={tileOf('checklist', 'm')} />);
    fireEvent.click(screen.getByTestId('home-tile-checklist-open'));
    return screen.findByTestId('home-checklist-module');
  }

  it('lists every pending item with the words the Optimizer stored', async () => {
    const sheet = await openChecklist();
    expect(within(sheet).getAllByTestId('home-checklist-item')).toHaveLength(9);
    expect(sheet.textContent).toContain('Client checklist: 2 of 3 applied');
    expect(performanceReads).toContain('e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed');
  });

  it('exports the checklist as a CSV of its items, written client-side', async () => {
    const created: Blob[] = [];
    const createUrl = spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob);
      return 'blob:checklist';
    });
    const revokeUrl = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      const sheet = await openChecklist();
      const exportButton = within(sheet).getByRole('button', { name: /Export checklist/ });
      await waitFor(() => expect(exportButton.hasAttribute('disabled')).toBe(false));
      fireEvent.click(exportButton);
      expect(created).toHaveLength(1);
      const text = await (created[0] as Blob).text();
      const lines = text.trimEnd().split('\r\n');
      expect(lines[0]).toBe('Portfolio,Item,Why,Impact per day,Raised');
      expect(lines).toHaveLength(10);
      expect(text).toContain('Client checklist: 2 of 3 applied');
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it('opens the existing report email for the brand, and says what it sends', async () => {
    const sheet = await openChecklist();
    expect(screen.queryByTestId('report-email-dialog')).toBeNull();
    expect(sheet.textContent).toContain(EMAIL_NOTE);
    fireEvent.click(within(sheet).getByRole('button', { name: /Send by email/ }));
    const dialog = await screen.findByTestId('report-email-dialog');
    expect(dialog.getAttribute('data-brand')).toBe(PINK_ELEPHANT_BRAND_ID);
  });

  it('says so when nothing is open, and offers no empty export', async () => {
    recommendations = [];
    const sheet = await openChecklist();
    expect(sheet.textContent).toContain('Nothing is open for the client right now.');
    const exportButton = within(sheet).getByRole('button', { name: /Export checklist/ });
    expect(exportButton.hasAttribute('disabled')).toBe(true);
  });
});
