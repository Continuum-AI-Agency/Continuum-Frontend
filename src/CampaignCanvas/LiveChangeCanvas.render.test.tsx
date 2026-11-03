import { describe, expect, it } from 'bun:test';
import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { cardHeight, cardsById, columnMapFromLiveChange } from '@/lib/campaign-canvas/columnMap';
import { MapCardBox } from './columnMap/ColumnMapFlow';
import { LiveChangeCanvas } from './LiveChangeCanvas';

const node = (
  overrides: Partial<LiveChangeNode> & Pick<LiveChangeNode, 'id' | 'level'>,
): LiveChangeNode => ({
  parentId: null,
  name: overrides.id,
  status: 'ACTIVE',
  dailyBudgetMinor: null,
  mark: 'unchanged',
  changes: [],
  basedOnId: null,
  ...overrides,
});

const PREVIEW: LiveChangePreviewPayload = {
  approvalId: 'appr_1',
  toolCallId: 'call_1',
  toolName: 'change_meta_placements',
  partId: 'live-change:appr_1',
  subject: 'New PAUSED ad set with new placements',
  currency: 'MXN',
  nodes: [
    node({ id: '100', level: 'campaign', name: 'OCTUBRE // EASY // MENSAJES' }),
    node({
      id: '200',
      level: 'adset',
      parentId: '100',
      name: 'CONJUNTO GEO',
      dailyBudgetMinor: 30000,
    }),
    node({ id: '300', level: 'ad', parentId: '200', name: 'Reel spinning' }),
    node({
      id: 'new:1',
      level: 'adset',
      parentId: '100',
      name: 'CONJUNTO GEO (copy)',
      mark: 'added',
      status: null,
      basedOnId: '200',
      changes: [{ field: 'placements', before: 'Automatic', after: 'instagram reels' }],
    }),
    node({
      id: 'new:2',
      level: 'ad',
      parentId: 'new:1',
      name: 'Reel spinning',
      mark: 'added',
      status: null,
    }),
  ],
  truncated: false,
  counts: { changed: 0, added: 2, paused: 0 },
  readAt: '2026-10-30T12:00:00Z',
};

const cardHtml = (id: string) => {
  const card = cardsById(columnMapFromLiveChange(PREVIEW)).get(id);
  if (!card) throw new Error(`no card ${id}`);
  return renderToStaticMarkup(
    <MapCardBox
      card={card}
      levelLabel={card.level === 'adset' ? 'Ad set' : card.level === 'ad' ? 'Ad' : 'Campaign'}
      height={cardHeight(card)}
      dimmed={card.mark === 'unchanged'}
      focused={false}
      foldSelected={false}
      testIdPrefix="live-change-node-"
      onSelectFolded={null}
      selected={false}
    />,
  );
};

describe('LiveChangeCanvas', () => {
  it('draws each node with its mark, the copy beside its source, and the change before → after', () => {
    expect(cardHtml('200')).toContain('data-testid="live-change-node-200" data-mark="unchanged"');
    const copy = cardHtml('new:1');
    expect(copy).toContain('data-testid="live-change-node-new:1" data-mark="added"');
    expect(copy).toContain('copy of CONJUNTO GEO');
    expect(copy).toContain('Automatic');
    expect(copy).toContain('instagram reels');
  });

  it('docks the summary and the next-change control in the bar above the map, not over it', () => {
    const html = renderToStaticMarkup(<LiveChangeCanvas preview={PREVIEW} decision="pending" />);
    expect(html).toContain('data-testid="column-map"');
    const bar = html.slice(
      html.indexOf('data-testid="column-map-bar"'),
      html.indexOf('rf__wrapper'),
    );
    expect(bar).toContain('2 new, paused');
    expect(bar).toContain('data-testid="map-next-change"');
    expect(html).toContain('Preview · approve in chat');
    // Fit to screen fits the width; the minimap waits for a measured pane ≥ 600 px.
    expect(html).toContain('data-testid="map-fit-width"');
    expect(html).not.toContain('react-flow__controls-fitview');
    expect(html).not.toContain('data-testid="rf__minimap"');
  });

  it('words the status and dims it, instead of a raw ACTIVE', () => {
    const html = cardHtml('200');
    expect(html).toContain('Active');
    expect(html).not.toContain('ACTIVE');
    expect(html).toContain('data-testid="map-card-status"');
  });

  it('says how the approval ended', () => {
    expect(
      renderToStaticMarkup(<LiveChangeCanvas preview={PREVIEW} decision="approved" />),
    ).toContain('Approved in chat');
    expect(
      renderToStaticMarkup(<LiveChangeCanvas preview={PREVIEW} decision="denied" />),
    ).toContain('Denied · nothing changed');
  });
});
