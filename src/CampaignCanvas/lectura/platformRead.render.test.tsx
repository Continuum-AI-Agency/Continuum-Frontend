import { afterEach, describe, expect, it } from 'bun:test';
import type { LiveChangePreviewPayload } from '@continuum/contracts';
import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import { LIVE_BATCH_PREVIEW } from '@/lib/campaign-canvas/lectura.fixtures';
import { useCanvasView } from './CanvasViewToggle';
import { LecturaView } from './LecturaView';

afterEach(cleanup);

const pmax = {
  ...LIVE_BATCH_PREVIEW,
  toolName: 'google_ads_pause_asset_group',
  platform: 'google',
  channel: 'PERFORMANCE_MAX',
  nodes: [
    {
      id: 'g1',
      parentId: null,
      level: 'campaign',
      name: 'PMax · Membresías',
      status: 'ENABLED',
      dailyBudgetMinor: 80000,
      mark: 'unchanged',
      changes: [],
      basedOnId: null,
    },
    {
      id: 'ag1',
      parentId: 'g1',
      level: 'adset',
      name: 'Asset group A',
      status: 'ENABLED',
      dailyBudgetMinor: null,
      mark: 'paused',
      changes: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
      basedOnId: null,
      assetSummary: '5 headlines · 6 images · 1 video',
    },
  ],
} as LiveChangePreviewPayload;

describe('Read in each platform’s words', () => {
  it('chips the chat card with its platform: Meta by default', () => {
    const html = renderToStaticMarkup(
      <LecturaView size="chat" model={lecturaFromLiveChange(LIVE_BATCH_PREVIEW)} />,
    );
    expect(html).toContain('data-testid="platform-chip" data-platform="meta">Meta<');
  });

  it('draws a Performance Max asset group with its assets, never an ad list', () => {
    const model = lecturaFromLiveChange(pmax);
    const html = renderToStaticMarkup(<LecturaView model={model} />);
    expect(html).toContain('1 asset group');
    expect(html).toContain('Pause the asset group');
    expect(html).toContain('data-testid="lectura-assets-ag1"');
    expect(html).toContain('5 headlines · 6 images · 1 video');
    expect(html).not.toContain('No assets read');
    const chat = renderToStaticMarkup(<LecturaView size="chat" model={model} />);
    expect(chat).toContain('data-platform="google_pmax">Google PMax<');
  });
});

function Probe({ taskKey, onView }: { taskKey: number; onView: (view: string) => void }) {
  const { view, startEditing } = useCanvasView('proposed', taskKey);
  onView(view);
  return (
    <button type="button" onClick={startEditing}>
      edit
    </button>
  );
}

describe('a second proposal mid-edit', () => {
  it('opens in Read again: a new task key ends the edit', () => {
    const views: string[] = [];
    const { getByRole, rerender } = render(
      <Probe taskKey={1} onView={(view) => views.push(view)} />,
    );
    expect(views.at(-1)).toBe('lectura');
    act(() => getByRole('button').click());
    expect(views.at(-1)).toBe('mapa');
    rerender(<Probe taskKey={1} onView={(view) => views.push(view)} />);
    expect(views.at(-1)).toBe('mapa');
    rerender(<Probe taskKey={2} onView={(view) => views.push(view)} />);
    expect(views.at(-1)).toBe('lectura');
  });
});
