import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SCAFFOLD_COPY_WITH_TESTS } from '@/lib/campaign-canvas/columnMap.fixtures';
import { lecturaFromCanvasGraph, lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import { LIVE_BATCH_PREVIEW, SCAFFOLD_GRAPH } from '@/lib/campaign-canvas/lectura.fixtures';
import { LiveChangeCompanion } from '../LiveChangeCompanion';
import { CanvasViewHint, CanvasViewToggle } from './CanvasViewToggle';
import { CHAT_CHANGES_SHOWN, LecturaView } from './LecturaView';
import { LiveChangeChatCard } from './LiveChangeChatCard';

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

describe('one drawing, three sizes', () => {
  it('chat: changes first, the budget before → after and Open in canvas, no ad set cards', () => {
    let opened = 0;
    const html = renderToStaticMarkup(
      <LiveChangeChatCard preview={LIVE_BATCH_PREVIEW} onOpen={() => (opened += 1)} />,
    );
    expect(html).toContain('data-testid="lectura-chat-card"');
    expect(html).toContain('3 changes');
    expect(html).toContain('data-testid="lectura-change-2202" data-mark="paused"');
    expect(html).toMatch(/line-through">\$1,150 MXN<\/span>.*\$1,000 MXN\/day/);
    expect(html).toContain('Open in canvas');
    expect(html).not.toContain('data-testid="lectura-adset-');
    expect(html.indexOf('lectura-change-2202')).toBeLessThan(html.indexOf('Daily budget'));
    expect(opened).toBe(0);
  });

  it('chat: past three changes, the rest wait in the canvas', () => {
    const many = {
      ...liveModel,
      changes: [...liveModel.changes, ...liveModel.changes.map((c) => ({ ...c, id: `${c.id}b` }))],
    };
    const html = renderToStaticMarkup(<LecturaView model={many} size="chat" />);
    expect(html.match(/data-testid="lectura-change-/g)).toHaveLength(CHAT_CHANGES_SHOWN);
    expect(html).toContain('+3 more changes in the canvas');
    expect(html).not.toContain('Open in canvas');
  });

  it('panel and page draw the same pieces; the page is wider', () => {
    const panel = renderToStaticMarkup(<LecturaView model={liveModel} size="panel" />);
    const page = renderToStaticMarkup(<LecturaView model={liveModel} size="page" />);
    expect(panel).toContain('data-size="panel"');
    expect(page).toContain('data-size="page"');
    expect(page).toContain('max-w-6xl');
    for (const id of ['lectura-change-2202', 'lectura-adset-2203']) {
      expect(panel).toContain(id);
      expect(page).toContain(id);
    }
  });

  it('a campaign copy reads its new ad sets first, as changes', () => {
    const copy = lecturaFromCanvasGraph(
      SCAFFOLD_COPY_WITH_TESTS.nodes,
      SCAFFOLD_COPY_WITH_TESTS.edges,
    );
    const html = renderToStaticMarkup(<LecturaView model={copy} />);
    expect(html).toContain('2 changes');
    expect(html).toContain('data-testid="lectura-change-s4" data-mark="added"');
  });
});

describe('the auto-switch hint', () => {
  it('says why the pane opened in Read and can be dismissed', () => {
    const html = renderToStaticMarkup(
      <CanvasViewHint hint="Opened in Read because Jaina proposed changes" onDismiss={() => {}} />,
    );
    expect(html).toContain('Opened in Read because Jaina proposed changes');
    expect(html).toContain('aria-label="Dismiss"');
    expect(renderToStaticMarkup(<CanvasViewHint hint={null} onDismiss={() => {}} />)).toBe('');
  });
});
