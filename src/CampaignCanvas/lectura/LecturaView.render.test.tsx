import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lecturaFromCanvasGraph, lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import { LIVE_BATCH_PREVIEW, SCAFFOLD_GRAPH } from '@/lib/campaign-canvas/lectura.fixtures';
import { LiveChangeCompanion } from '../LiveChangeCompanion';
import { CanvasViewToggle } from './CanvasViewToggle';
import { LecturaView } from './LecturaView';

const liveModel = lecturaFromLiveChange(LIVE_BATCH_PREVIEW);

describe('LecturaView on a live change', () => {
  const html = renderToStaticMarkup(<LecturaView model={liveModel} />);

  it('puts the changes first, each with its mark, breadcrumb and before → after', () => {
    expect(html.indexOf('3 changes')).toBeGreaterThan(-1);
    expect(html.indexOf('3 changes')).toBeLessThan(html.indexOf('Daily budget</span>'));
    expect(html).toContain('data-testid="lectura-change-2202" data-mark="paused"');
    expect(html).toContain('data-testid="lectura-change-2203" data-mark="changed"');
    expect(html).toContain('data-testid="lectura-change-new:1" data-mark="added"');
    expect(html).toMatch(
      /CAÑADAS \/\/ MENSAJES \/\/ Octubre 2026<\/span><span aria-hidden="true">›<\/span><span[^>]*>Lookalike 1% clientes</,
    );
    expect(html).toContain('Lowest cost per conversation in the campaign: 48 MXN');
    expect(html).toMatch(/line-through">\$300 MXN<\/span>.*\$450 MXN/);
  });

  it('shows the daily total before → after, the new paused budget apart, and the split', () => {
    expect(html).toMatch(/line-through">\$1,150 MXN<\/span>.*\$1,000 MXN\/day/);
    expect(html).toContain('+$150 MXN/day once the new, paused items are activated');
    expect(html).toContain('data-testid="lectura-split"');
    for (const tone of ['kept', 'changed', 'removed', 'new']) {
      expect(html).toContain(`data-tone="${tone}"`);
    }
  });

  it('draws every ad set as a card with its mark, dims the ads of a paused one', () => {
    expect(html).toContain('data-testid="lectura-adset-2202" data-mark="paused"');
    expect(html).toContain('data-testid="lectura-adset-new:1" data-mark="added"');
    expect(html).toContain('Based on Lookalike 1% clientes');
    expect(html).toContain('Stops with its ad set');
    expect(html).not.toContain('data-testid="lectura-table"');
  });

  it('keeps the expanded change closed until opened, and opens it in place', () => {
    expect(html).not.toContain('lectura-change-2203-expanded');
    const opened = renderToStaticMarkup(<LecturaView model={liveModel} initialExpandedId="2203" />);
    const expanded = opened.slice(opened.indexOf('lectura-change-2203-expanded'));
    expect(opened).toContain('aria-expanded="true"');
    expect(expanded).toContain('data-testid="lectura-adset-2203"');
    expect(expanded.indexOf('lectura-adset-2203')).toBeLessThan(
      expanded.indexOf('lectura-change-new:1'),
    );
  });

  it('switches the same reading to a table', () => {
    const table = renderToStaticMarkup(<LecturaView model={liveModel} initialLayout="table" />);
    expect(table).toContain('data-testid="lectura-table"');
    expect(table).toContain('data-testid="lectura-row-2203" data-mark="changed"');
    expect(table).toContain('New, paused');
    expect(table).toMatch(
      /data-testid="lectura-row-2202"[\s\S]*?line-through">\$300 MXN<\/span>[\s\S]*?stops/,
    );
    expect(table).not.toContain('$0.00');
    expect(table).not.toContain('data-testid="lectura-adset-2203"');
  });

  it('opens in the table on its own past twelve ad sets', () => {
    const big = renderToStaticMarkup(<LecturaView model={{ ...liveModel, adSetCount: 13 }} />);
    expect(big).toContain('data-testid="lectura-table"');
  });
});

describe('LecturaView on a new campaign', () => {
  const html = renderToStaticMarkup(
    <LecturaView model={lecturaFromCanvasGraph(SCAFFOLD_GRAPH.nodes, SCAFFOLD_GRAPH.edges)} />,
  );

  it('skips the changes list and shows the campaign, its total and provenance', () => {
    expect(html).toContain('data-kind="new"');
    expect(html).not.toContain('aria-label="Changes"');
    expect(html).toContain('ZAPOPAN // MENSAJES // Noviembre 2026');
    expect(html).toContain('$600 MXN/day');
    expect(html).toContain('You gave 3');
    expect(html).toContain('Jaina filled 1');
    expect(html).toContain('Jaina asks 1');
    expect(html).toContain('src="https://example.test/reel.jpg"');
  });
});

describe('the Map / Read switch', () => {
  it('marks the current view and disables the map on a phone', () => {
    const html = renderToStaticMarkup(
      <CanvasViewToggle view="lectura" onChange={() => {}} mapDisabled />,
    );
    expect(html).toMatch(
      /aria-pressed="false" disabled="" title="The map needs a wider screen"[^>]*data-view="mapa"/,
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*data-view="lectura"/);
  });

  it('opens a live change in Read on first paint', () => {
    const html = renderToStaticMarkup(
      <LiveChangeCompanion preview={LIVE_BATCH_PREVIEW} decision="pending" />,
    );
    expect(html).toContain('data-testid="lectura-view"');
    expect(html).not.toContain('data-testid="live-change-canvas"');
    expect(html).toContain('Preview · approve in chat');
  });
});
