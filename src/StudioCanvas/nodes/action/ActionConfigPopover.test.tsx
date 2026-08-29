import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

// The real popover and select are Base UI popups. Stubbing them mounts the controls
// eagerly, which is what these assertions are about — the field descriptors turning
// into the right controls, and a change reaching the config patcher.
mock.module('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      data-testid="config-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

// Same checkbox stand-in as SubtitlesConfig.test.tsx. Bun registers every file's
// mock.module before any test runs, so when the action tests run together this mock is
// active no matter which file registered last — matching it keeps this file's switch
// assertions identical standalone and in a combined run.
mock.module('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

const patch = mock();
mock.module('../../hooks/useNodeConfigPatch', () => ({
  useNodeConfigPatch: () => patch,
}));

// video.overlay / video.watermark route to the bespoke OverlayConfig panel, which reads
// the canvas store, the brand book and the asset signer. Those boundaries are stubbed
// the same way OverlayConfig.test.tsx stubs them — this file only asserts the popover
// ROUTES to the panel, not the panel's own behavior.
mock.module('../../stores/useStudioStore', () => ({
  useStudioStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      nodes: [{ id: 'node-1', type: 'action', position: { x: 500, y: 300 }, data: {} }],
      edges: [],
      setNodes: mock(),
      setEdges: mock(),
      defaultEdgeType: 'bezier',
      brandId: 'brand-1',
    }),
}));
mock.module('@/lib/brands/useBrandBook.client', () => ({
  useBrandBook: () => ({ brandTokens: null, brandBook: null, isLoading: false, isError: false }),
}));
mock.module('@/lib/creative-assets/storageClient', () => ({
  createSignedAssetUrl: mock(async () => 'https://signed.test/logo.png'),
}));
mock.module('@/lib/creative-assets/config', () => ({
  getCreativeAssetsBucket: () => 'brand-profile-assets',
}));

import type { ActionId } from '@continuum/contracts';
import { parseActionConfig } from '../../utils/actions/actionConfig';
import { ActionConfigPopover } from './ActionConfigPopover';

const renderPopover = (actionId: ActionId, config: Record<string, unknown> = {}) =>
  render(<ActionConfigPopover nodeId="node-1" actionId={actionId} config={config} />);

describe('ActionConfigPopover', () => {
  beforeEach(() => {
    patch.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders image.rotate as one bounded slider, never a bare number box', () => {
    const { container } = renderPopover('image.rotate');

    // −360…360 at step 1 is 720 stops, a range a drag can resolve, so it earns a track.
    expect(container.querySelectorAll('[data-slot="slider-field"]').length).toBe(1);
    expect(container.querySelectorAll('[data-slot="number-scrub-field"]').length).toBe(0);

    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range.getAttribute('min')).toBe('-360');
    expect(range.getAttribute('max')).toBe('360');
    expect(range.value).toBe('90');
  });

  it('renders an unresolvable range as a scrub field rather than a slider', () => {
    // `size` is 1…10_000 at step 1: bounded, but no track has ten thousand pixels.
    const { container } = renderPopover('text.split');

    const scrubLabels = Array.from(
      container.querySelectorAll('[data-slot="number-scrub-field"]'),
    ).map((field) => field.querySelector('span')?.textContent);
    expect(scrubLabels).toContain('Size');
    expect(container.querySelectorAll('[data-slot="slider-field"]').length).toBe(0);
  });

  it('renders text.findReplace as two text inputs and three booleans', () => {
    const { container } = renderPopover('text.findReplace');

    expect(container.querySelectorAll('input[type="text"]').length).toBe(2);
    // find/replace plus the caseSensitive, regex and wholeWord flags.
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(3);
  });

  it('renders an enum field as a select over the schema options', () => {
    const { getByTestId } = renderPopover('image.filter');

    const options = Array.from(getByTestId('config-select').querySelectorAll('option')).map(
      (option) => option.getAttribute('value'),
    );
    expect(options).toEqual([
      'none',
      'noir',
      'vivid',
      'faded',
      'fade',
      'warm',
      'cool',
      'mono',
      'grayscale',
      'sepia',
      'duotone',
      'clarendon',
      'moon',
      'nashville',
    ]);
  });

  it('patches the whole merged config when the slider is moved by keyboard', () => {
    const { container } = renderPopover('image.rotate');

    // Keyboard, not a synthetic drag: it is the path that has to keep working, and the
    // fader this control came from shipped with its focus ring cleared.
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.keyDown(range, { key: 'ArrowRight' });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('image.rotate', {}), degrees: 91 },
    });
  });

  it('flips a boolean through the switch', () => {
    const { container } = renderPopover('text.findReplace');

    // The first flag in schema order is caseSensitive.
    fireEvent.click(container.querySelector('input[type="checkbox"]') as HTMLElement);

    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('text.findReplace', {}), caseSensitive: true },
    });
  });

  it('sets a nullable field back to null rather than to zero', () => {
    // `maxParts: null` on text.split means "no cap", which 0 would silently change
    // into a real value.
    const { getByLabelText } = renderPopover('text.split', { maxParts: 2 });

    fireEvent.click(getByLabelText('Clear Max Parts'));

    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('text.split', { maxParts: 2 }), maxParts: null },
    });
  });

  it('clears a nullable number when its input is emptied', () => {
    const { container } = renderPopover('text.split', { maxParts: 2 });
    const maxParts = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    ).find((input) => input.value === '2');

    fireEvent.change(maxParts as HTMLInputElement, { target: { value: '' } });

    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('text.split', { maxParts: 2 }), maxParts: null },
    });
  });

  it('routes video.subtitles to the SubtitlesConfig panel', () => {
    const { getByRole } = renderPopover('video.subtitles');

    // The preset gallery is SubtitlesConfig's own UI — the generic renderer would
    // have drawn a select for `preset`, never a labelled chip.
    expect(getByRole('button', { name: /^Pop —/ })).toBeDefined();
  });

  it('routes video.overlay to the OverlayConfig panel', () => {
    const { getByLabelText } = renderPopover('video.overlay');

    // The 3x3 position picker exists only in OverlayConfig; the generic renderer
    // would have drawn a plain enum select.
    expect(getByLabelText('Bottom left')).toBeDefined();
  });
});
