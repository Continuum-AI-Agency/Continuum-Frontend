import { describe, expect, it } from 'bun:test';
import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
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

describe('LiveChangeCanvas', () => {
  it('draws every node with its mark, the copy beside its source, and the change before → after', () => {
    const html = renderToStaticMarkup(<LiveChangeCanvas preview={PREVIEW} decision="pending" />);
    expect(html).toContain('data-testid="live-change-node-200" data-mark="unchanged"');
    expect(html).toContain('data-testid="live-change-node-new:1" data-mark="added"');
    expect(html).toContain('copy of CONJUNTO GEO');
    expect(html).toContain('Automatic');
    expect(html).toContain('instagram reels');
    expect(html).toContain('2 new, paused');
    expect(html).toContain('Preview · approve in chat');
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
