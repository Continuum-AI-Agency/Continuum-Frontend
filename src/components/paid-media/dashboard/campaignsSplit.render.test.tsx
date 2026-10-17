import { describe, expect, it } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { campaignsSplit } from './campaignsSplit';

// PP-L1V Dashboard layout shift (div.mt-1.5.flex-1, CLS 0.19–0.53): react-resizable-panels 4
// reads a NUMBER as pixels, so `defaultSize={75}` / `{25}` painted a 75px chart pane and a
// 25px rail until hydration measured the group and re-laid it 75 / 25 percent — the chart and
// the rail jumped 800px sideways. What the server paints is what the user sees first, so the
// split must already carry its final proportions there.

function firstPaint(): { chart: string; rail: string } {
  const html = renderToString(
    <ResizablePanelGroup {...campaignsSplit.group}>
      <ResizablePanel {...campaignsSplit.chart}>chart</ResizablePanel>
      <ResizableHandle />
      <ResizablePanel {...campaignsSplit.rail}>rail</ResizablePanel>
    </ResizablePanelGroup>,
  );
  const panels = [...html.matchAll(/<div[^>]*data-panel="true"[^>]*style="([^"]*)"/g)].map(
    (match) => match[1] ?? '',
  );
  expect(panels).toHaveLength(2);
  return { chart: panels[0] ?? '', rail: panels[1] ?? '' };
}

describe('the campaigns split, first paint', () => {
  it('paints the chart and the rail at 75 / 25 of the group, never as pixel widths', () => {
    const { chart, rail } = firstPaint();
    expect(chart).not.toMatch(/flex-basis:\s*\d+px/);
    expect(rail).not.toMatch(/flex-basis:\s*\d+px/);
    expect(chart).toMatch(/flex-grow:\s*75\b/);
    expect(rail).toMatch(/flex-grow:\s*25\b/);
  });

  it('bounds the panes in percent too: a bare number would be a pixel floor', () => {
    expect(typeof campaignsSplit.chart.minSize).toBe('string');
    expect(typeof campaignsSplit.rail.minSize).toBe('string');
  });
});
