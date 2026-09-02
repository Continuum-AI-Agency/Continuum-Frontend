// The unpreviewable-effects badge: the CSS preview cannot show chromaKey/tint/etc.,
// and a preview that silently omits an effect is how an export surprises its author.
// The badge is the inspector's honest note that those effects render only in the export.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import type { TimelineItem } from '../../types';
import { type ClipBackgroundRemoval, ClipInspector } from './ClipInspector';

afterEach(cleanup);

const noop = () => {};

const renderInspector = (
  item: TimelineItem | undefined,
  extra: {
    onSetEffects?: (patch: Partial<ClipEffectSpec>) => void;
    sourceAssetId?: string;
    backgroundRemoval?: ClipBackgroundRemoval;
  } = {},
) =>
  render(
    <ClipInspector
      item={item}
      durationSec={4}
      label="Clip"
      sourceAssetId={extra.sourceAssetId}
      backgroundRemoval={extra.backgroundRemoval}
      onTrim={noop}
      onSetStill={noop}
      onSetMute={noop}
      onSetEffects={extra.onSetEffects ?? noop}
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

describe('ClipInspector effect controls', () => {
  const LABELS = [
    'Warmth',
    'Hue',
    'Sepia',
    'Grayscale',
    'Invert',
    'Blur',
    'Vignette',
    'Film grain',
    'Chromatic aberration',
    'VHS',
    'Pixelate',
    'Tint',
  ];

  it('surfaces every ClipEffectSpec field the export already draws', () => {
    const { getByLabelText } = renderInspector(item());
    for (const label of LABELS) expect(getByLabelText(label)).toBeTruthy();
  });

  it('writes the whole chroma-key object on, and removes it off', () => {
    const onSetEffects = mock((_: Partial<ClipEffectSpec>) => {});
    const { getByRole } = renderInspector(item(), { onSetEffects });
    // A keyer at tolerance 0 still keys exact matches, so "off" has to be absence.
    fireEvent.click(getByRole('switch', { name: 'Chroma key' }));
    expect(onSetEffects.mock.calls[0][0]).toEqual({
      chromaKey: { color: '#00ff00', tolerance: 0.35, softness: 0.1 },
    });

    cleanup();
    const keyed = renderInspector(item({ chromaKey: { color: '#00ff00', tolerance: 0.35, softness: 0.1 } }), {
      onSetEffects,
    });
    fireEvent.click(keyed.getByRole('switch', { name: 'Chroma key' }));
    expect(onSetEffects.mock.calls[1][0]).toEqual({ chromaKey: undefined });
  });

  it('reveals the key colour and tolerances only once the keyer is on', () => {
    const off = renderInspector(item());
    expect(off.queryByLabelText('Key colour')).toBeNull();
    cleanup();
    const on = renderInspector(item({ chromaKey: { color: '#00ff00', tolerance: 0.2, softness: 0 } }));
    expect(on.getByLabelText('Key colour')).toBeTruthy();
    expect(on.getByLabelText('Tolerance')).toBeTruthy();
    expect(on.getByLabelText('Softness')).toBeTruthy();
  });

  it('keeps the tint amount when only the colour changes', () => {
    const onSetEffects = mock((_: Partial<ClipEffectSpec>) => {});
    const { getByLabelText } = renderInspector(item({ tint: { color: '#ff0000', amount: 0.4 } }), {
      onSetEffects,
    });
    fireEvent.change(getByLabelText('Tint colour'), { target: { value: '#00ff00' } });
    expect(onSetEffects.mock.calls[0][0]).toEqual({ tint: { color: '#00ff00', amount: 0.4 } });
  });
});

describe('ClipInspector background removal', () => {
  const removal = (over: Partial<ClipBackgroundRemoval> = {}): ClipBackgroundRemoval => ({
    run: noop,
    pending: false,
    progress: 0,
    ...over,
  });

  it('is absent entirely on a host whose media bin cannot grow', () => {
    const { queryByRole } = renderInspector(item());
    expect(queryByRole('button', { name: /Remove background/ })).toBeNull();
  });

  it('refuses, and says why, when the clip has no Library asset behind it', () => {
    const { getByRole, container } = renderInspector(item(), { backgroundRemoval: removal() });
    expect(getByRole('button', { name: /Remove background/ }).hasAttribute('disabled')).toBe(true);
    expect(container.textContent).toContain('Save this clip to the Library first');
  });

  it('runs once the clip has one', () => {
    const run = mock(() => {});
    const { getByRole, container } = renderInspector(item(), {
      sourceAssetId: 'asset-1',
      backgroundRemoval: removal({ run }),
    });
    const button = getByRole('button', { name: /Remove background/ });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(container.textContent).not.toContain('Save this clip to the Library first');
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('shows the service progress while it runs, and its error after', () => {
    const running = renderInspector(item(), {
      sourceAssetId: 'asset-1',
      backgroundRemoval: removal({ pending: true, progress: 0.42 }),
    });
    expect(running.container.textContent).toContain('42%');
    cleanup();
    const failed = renderInspector(item(), {
      sourceAssetId: 'asset-1',
      backgroundRemoval: removal({ error: 'The matte service is down' }),
    });
    expect(failed.container.textContent).toContain('The matte service is down');
  });
});
