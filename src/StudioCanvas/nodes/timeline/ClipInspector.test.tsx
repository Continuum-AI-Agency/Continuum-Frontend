// The unpreviewable-effects badge: the CSS preview cannot show chromaKey/tint/etc.,
// and a preview that silently omits an effect is how an export surprises its author.
// The badge is the inspector's honest note that those effects render only in the export.

import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { TimelineItem } from '../../types';
import { ClipInspector } from './ClipInspector';

afterEach(cleanup);

const noop = () => {};

const renderInspector = (item: TimelineItem | undefined) =>
  render(
    <ClipInspector
      item={item}
      durationSec={4}
      label="Clip"
      onTrim={noop}
      onSetStill={noop}
      onSetMute={noop}
      onSetEffects={noop}
      onSetTransition={noop}
      onClose={noop}
    />,
  );

const item = (effects?: TimelineItem['effects']): TimelineItem => ({
  id: 'clip-1',
  order: 0,
  sourceNodeId: 'src-1',
  kind: 'video',
  effects,
});

describe('ClipInspector unpreviewable-effects badge', () => {
  it('shows a singular badge for one unpreviewable effect', () => {
    const { container } = renderInspector(item({ tint: { color: '#ff0000', amount: 0.4 } }));
    expect(container.textContent).toContain('1 effect renders but can’t be previewed');
  });

  it('counts every unpreviewable effect on the clip', () => {
    const { container } = renderInspector(
      item({
        tint: { color: '#ff0000', amount: 0.4 },
        vignette: { amount: 0.8 },
        pixelate: { blockPx: 16 },
      }),
    );
    expect(container.textContent).toContain('3 effects render but can’t be previewed');
  });

  it('renders no badge when every effect previews truthfully', () => {
    const { container } = renderInspector(
      item({ adjustments: { brightness: 1.2 }, cornerRadiusFrac: 0.2 }),
    );
    expect(container.textContent).not.toContain('previewed');
  });
});
