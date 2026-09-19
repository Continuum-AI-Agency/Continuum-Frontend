import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { ConversionVolumeBadge } from './ConversionVolumeBadge';
import { ConversionVolumePanel } from './ConversionVolumePanel';

afterEach(cleanup);

const confidence = {
  events: 786,
  sampleSize: 0.86,
  underFloor: { adsetIds: ['a1'], floorEvents: 20 },
  actionables: [{ code: 'under_event_floor', adsetIds: ['a1'], message: 'Consolidate a1.' }],
};

describe('conversion volume', () => {
  it('shows the count, the objective word, the band and the under-floor count', () => {
    const { container } = render(
      <ConversionVolumeBadge confidence={confidence} resultLabel="conversations" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('786');
    expect(text).toContain('conversations · 14d');
    expect(text).toContain('Strong');
    expect(text).toContain('1 under floor');
    expect(text).not.toContain('%');
  });
  it('names the ad sets under the floor and the action to raise the count', () => {
    const { container } = render(
      <ConversionVolumePanel
        confidence={confidence}
        nameById={new Map([['a1', 'Cold Lookalike']])}
        resultLabel="conversations"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Cold Lookalike');
    expect(text).toContain('To raise it: Consolidate a1.');
  });
  it('says so when there is no scored cycle', () => {
    const { container } = render(<ConversionVolumeBadge confidence={null} />);
    expect(container.textContent).toContain('no scored cycle yet');
  });
});
