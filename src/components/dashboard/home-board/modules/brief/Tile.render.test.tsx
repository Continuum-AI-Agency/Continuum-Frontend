import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { HomeBoardTile, HomeBriefData } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HomeReadLoad } from '../../homeRead';
import { ctxFor } from '../ask/__fixtures__/readings';
import {
  GOOGLE_ACCOUNT,
  GOOGLE_NARRATIVE,
  GOOGLE_READ_STALE,
  META_ACCOUNT,
  META_NARRATIVE,
  META_READ_TODAY,
} from './__fixtures__/accountReads';
import type { BriefRead } from './briefModel';

// The tile's one read is replaced here; `mock.module` replaces it for the whole process, so this
// file runs on its own.
let reads: BriefRead[] = [];
let retries = 0;
const realReads = await import('./useBriefReads');
mock.module('./useBriefReads', () => ({
  ...realReads,
  useBriefReads: () => ({
    reads,
    retry: () => {
      retries += 1;
    },
  }),
}));

let briefLoad: HomeReadLoad<HomeBriefData> = { status: 'unavailable' };
const realGoalRead = await import('../../useHomeGoalRead');
mock.module('../../useHomeGoalRead', () => ({ ...realGoalRead, useHomeGoalRead: () => briefLoad }));

const { default: BriefTile } = await import('./Tile');

const tile: HomeBoardTile = { id: 'brief', size: 'm', urgency: 1, score: 12, why: null };
const ctx = ctxFor('operate', { adAccounts: [META_ACCOUNT, GOOGLE_ACCOUNT] });

afterEach(() => {
  cleanup();
  reads = [];
  retries = 0;
  briefLoad = { status: 'unavailable' };
});

describe('BriefTile', () => {
  it('shows the latest stored read, dated, with its words as stored', () => {
    reads = [
      { account: META_ACCOUNT, status: 'success', data: META_READ_TODAY },
      { account: GOOGLE_ACCOUNT, status: 'success', data: GOOGLE_READ_STALE },
    ];
    render(<BriefTile ctx={ctx} tile={tile} />);
    const frame = screen.getByTestId('home-tile-brief');
    expect(frame.getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-brief-headline');
    expect(headline.getAttribute('data-value')).toBe('2026-11-03');
    expect(headline.textContent).toContain('Read on Nov 3');
    expect(screen.getByText(META_NARRATIVE)).toBeTruthy();
    expect(screen.getByText('+1 more account in the brief')).toBeTruthy();
  });

  it('says how old a stale read is', () => {
    reads = [{ account: GOOGLE_ACCOUNT, status: 'success', data: GOOGLE_READ_STALE }];
    render(<BriefTile ctx={ctx} tile={tile} />);
    const headline = screen.getByTestId('home-tile-brief-headline');
    expect(headline.getAttribute('data-value')).toBe('2026-10-30');
    expect(headline.textContent).toContain('Read on Oct 30');
    expect(headline.textContent).toMatch(/\d+ days old/);
  });

  it('opens every read with the honest evidence line', async () => {
    reads = [
      { account: META_ACCOUNT, status: 'success', data: META_READ_TODAY },
      { account: GOOGLE_ACCOUNT, status: 'success', data: GOOGLE_READ_STALE },
    ];
    render(<BriefTile ctx={ctx} tile={tile} />);
    fireEvent.click(screen.getByTestId('home-tile-brief-open'));
    expect(await screen.findByTestId('home-brief-module')).toBeTruthy();
    expect(screen.getAllByTestId('home-brief-entry')).toHaveLength(2);
    expect(screen.getAllByText(GOOGLE_NARRATIVE).length).toBeGreaterThan(0);
    expect(screen.getByText(/Numbered evidence that re-runs each figure/)).toBeTruthy();
  });

  it('is missing, in one sentence, when nothing is stored', () => {
    reads = [
      { account: META_ACCOUNT, status: 'success', data: null },
      { account: GOOGLE_ACCOUNT, status: 'success', data: null },
    ];
    render(<BriefTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-brief').getAttribute('data-module-state')).toBe('missing');
    expect(screen.getByTestId('home-tile-missing').textContent).toContain(
      'No daily read stored for these accounts yet',
    );
    expect(screen.queryByTestId('home-tile-brief-headline')).toBeNull();
  });

  it('is an error with a Retry when the read failed', () => {
    reads = [{ account: META_ACCOUNT, status: 'error', data: undefined }];
    render(<BriefTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-brief').getAttribute('data-module-state')).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retries).toBe(1);
  });

  it('is loading, never stuck, while a read is on its way', () => {
    reads = [{ account: META_ACCOUNT, status: 'pending', data: undefined }];
    render(<BriefTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-brief').getAttribute('data-module-state')).toBe('loading');
  });
});

describe('BriefTile with the numbered brief', () => {
  const data: HomeBriefData = {
    basis: 'deterministic_v1',
    locale: 'es',
    objective: null,
    sentences: [
      {
        id: 'opportunity',
        text: 'La mayor oportunidad: «gym», 9.16 MXN[1] al día recuperables.',
        figures: [
          {
            n: 1,
            label: 'Spending on nothing',
            value: 9.16,
            unit: 'currency',
            currency: 'MXN',
            display: '9.16 MXN',
            field: 'impact_per_day',
            source: {
              kind: 'optimizer.account_daily_reads',
              ref: '5251780631|platform_signal:8c5a',
              since: '2026-11-04',
              until: '2026-11-04',
            },
          },
        ],
      },
    ],
  };
  const ready: HomeReadLoad<HomeBriefData> = {
    status: 'ready',
    generatedAt: '2026-11-04T12:00:00Z',
    data,
  };

  it('prints the sentences with their numbers, in the words they were written', () => {
    reads = [{ account: META_ACCOUNT, status: 'success', data: META_READ_TODAY }];
    briefLoad = ready;
    render(<BriefTile ctx={ctx} tile={tile} />);
    const sentences = screen.getByTestId('home-tile-brief-sentences');
    expect(sentences.textContent).toContain('La mayor oportunidad');
    expect(sentences.querySelector('[data-citation="1"]')?.textContent).toBe('1');
    expect(screen.getByTestId('home-tile-brief-headline').getAttribute('data-figures')).toBe('1');
  });

  it('a brand with no stored daily read still has a brief', () => {
    reads = [];
    briefLoad = ready;
    render(<BriefTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-brief').getAttribute('data-module-state')).toBe('ready');
    expect(screen.getByTestId('home-tile-brief-headline').getAttribute('data-value')).toBe(
      '2026-11-04',
    );
  });

  it('opens each figure with its source and window, and drops the pending line', () => {
    reads = [{ account: META_ACCOUNT, status: 'success', data: META_READ_TODAY }];
    briefLoad = ready;
    render(<BriefTile ctx={ctx} tile={tile} />);
    fireEvent.click(screen.getByTestId('home-tile-brief-open'));
    const row = screen.getByTestId('home-brief-figure');
    expect(row.getAttribute('data-n')).toBe('1');
    expect(row.getAttribute('data-value')).toBe('9.16');
    expect(row.textContent).toContain('9.16 MXN');
    expect(row.textContent).toContain('The Optimizer’s daily read');
    expect(row.textContent).toContain('Nov 4');
    expect(screen.queryByTestId('home-brief-evidence-note')).toBeNull();
  });

  it('without the read it draws the stored narrative and its honest line, never an error', () => {
    reads = [{ account: META_ACCOUNT, status: 'success', data: META_READ_TODAY }];
    briefLoad = { status: 'unavailable' };
    render(<BriefTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-brief').getAttribute('data-module-state')).toBe('ready');
    expect(screen.queryByTestId('home-tile-brief-sentences')).toBeNull();
    fireEvent.click(screen.getByTestId('home-tile-brief-open'));
    expect(screen.getByTestId('home-brief-evidence-note')).toBeTruthy();
  });
});
