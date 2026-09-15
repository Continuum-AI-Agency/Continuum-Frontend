/**
 * ForgeTabs routes an "open in Render" intent: whatever on the Templates tab calls
 * `onOpenRender` lands the person on the Render tab with that intent handed to the grid.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ForgeRenderIntent } from './RenderRequestsGrid';

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
  RenderRequestsGrid: ({ intent }: { intent?: ForgeRenderIntent }) => (
    <p data-testid="render-grid">{JSON.stringify(intent ?? null)}</p>
  ),
}));
mock.module('@/components/forge/RenderJobsGrid', () => ({
  RenderJobsGrid: () => <p>Renders</p>,
}));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ForgeTabs } from './ForgeTabs';

afterEach(cleanup);

describe('ForgeTabs', () => {
  test('openRender switches to the Render tab and hands the grid its intent', async () => {
    render(<ForgeTabs brandId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.queryByTestId('render-grid')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Open in Render' }));

    expect(screen.getByRole('tab', { name: 'Render' }).getAttribute('aria-selected')).toBe('true');
    expect(JSON.parse(screen.getByTestId('render-grid').textContent ?? 'null')).toEqual({
      templateKey: '133',
      renderSetId: 'set-1',
    });
  }, 30_000);
});
