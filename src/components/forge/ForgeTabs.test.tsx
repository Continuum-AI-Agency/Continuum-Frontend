/**
 * ForgeTabs routes an "open in Render" intent: whatever on the Templates tab calls
 * `onOpenRender` lands the person on the Render tab with that intent handed to the grid, the
 * intent is dropped once the grid takes it, and the grid is never remounted by a tab round trip
 * (a remount reloads the rows and loses unsaved edits).
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { useEffect } from 'react';
import type { ForgeRenderIntent } from './RenderRequestsGrid';

let gridMounts = 0;

mock.module('@/components/forge/ForgeWorkbench', () => ({
  ForgeWorkbench: ({ onOpenRender }: { onOpenRender?: (intent: ForgeRenderIntent) => void }) => (
    <button
      type="button"
      onClick={() => onOpenRender?.({ templateKey: '133', renderSetId: 'set-1' })}
    >
      Open in Render
    </button>
  ),
}));
mock.module('@/components/forge/RenderRequestsGrid', () => ({
  RenderRequestsGrid: ({
    intent,
    onIntentConsumed,
    onFired,
  }: {
    intent?: ForgeRenderIntent;
    onIntentConsumed?: () => void;
    onFired?: (jobIds: string[]) => void;
  }) => {
    useEffect(() => {
      gridMounts += 1;
    }, []);
    return (
      <>
        <p data-testid="render-grid">{JSON.stringify(intent ?? null)}</p>
        <button type="button" onClick={onIntentConsumed}>
          Take intent
        </button>
        <button type="button" onClick={() => onFired?.(['job-1'])}>
          Fire batch
        </button>
      </>
    );
  },
}));
mock.module('@/components/forge/RenderJobsGrid', () => ({
  RenderJobsGrid: () => <p>Render ledger</p>,
}));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ForgeTabs } from './ForgeTabs';

afterEach(() => {
  cleanup();
  gridMounts = 0;
});

const intentOnGrid = () => JSON.parse(screen.getByTestId('render-grid').textContent ?? 'null');

describe('ForgeTabs', () => {
  test('shows all three tabs without mounting inactive grids', () => {
    render(<ForgeTabs brandId="22222222-2222-4222-8222-222222222222" />);

    expect(screen.getByRole('tab', { name: 'Templates' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Render' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Render ledger' })).toBeTruthy();
    expect(screen.queryByTestId('render-grid')).toBeNull();
    expect(screen.queryByText('Render ledger', { selector: 'p' })).toBeNull();
    expect(gridMounts).toBe(0);
  });

  test('openRender switches to the Render tab and hands the grid its intent, once', async () => {
    render(<ForgeTabs brandId="22222222-2222-4222-8222-222222222222" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open in Render' }));

    expect(screen.getByRole('tab', { name: 'Render' }).getAttribute('aria-selected')).toBe('true');
    await screen.findByTestId('render-grid');
    expect(intentOnGrid()).toEqual({ templateKey: '133', renderSetId: 'set-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Take intent' }));
    expect(intentOnGrid()).toBeNull();
  }, 30_000);

  test('the Render grid stays mounted across a tab round trip', async () => {
    render(<ForgeTabs brandId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Render' }));
    await screen.findByTestId('render-grid');
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Render' }));

    expect(await screen.findByTestId('render-grid')).toBeTruthy();
    expect(gridMounts).toBe(1);
  }, 30_000);

  test('a fired batch opens the Render ledger', async () => {
    render(<ForgeTabs brandId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Render' }));
    await screen.findByTestId('render-grid');
    fireEvent.click(screen.getByRole('button', { name: 'Fire batch' }));

    expect(screen.getByRole('tab', { name: 'Render ledger' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  }, 30_000);
});
