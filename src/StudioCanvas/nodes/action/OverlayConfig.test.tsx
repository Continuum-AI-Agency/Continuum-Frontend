import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// The burn-in panel's own controls are what is under test, so the store, the brand-book
// query and the browser signer are stubbed rather than mounted. Everything stubbed here
// is a boundary this component only reads through.
const patch = mock();
mock.module('../../hooks/useNodeConfigPatch', () => ({ useNodeConfigPatch: () => patch }));

const setNodes = mock();
const setEdges = mock();
let storeState: Record<string, unknown> = {};
mock.module('../../stores/useStudioStore', () => ({
  useStudioStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));

let brandTokens: unknown = null;
mock.module('@/lib/brands/useBrandBook.client', () => ({
  useBrandBook: () => ({ brandTokens, brandBook: null, isLoading: false, isError: false }),
}));

const createSignedAssetUrl = mock(async () => 'https://signed.test/logo.png');
mock.module('@/lib/creative-assets/storageClient', () => ({ createSignedAssetUrl }));
mock.module('@/lib/creative-assets/config', () => ({
  getCreativeAssetsBucket: () => 'brand-profile-assets',
}));

import { buildOverlayImageNode, OverlayConfig } from './OverlayConfig';

const ACTION_NODE = { id: 'act-1', type: 'action', position: { x: 500, y: 300 }, data: {} };

const renderPanel = (
  config: Record<string, unknown> = {},
  actionId: 'video.overlay' | 'video.watermark' = 'video.overlay',
) => render(<OverlayConfig nodeId="act-1" actionId={actionId} config={config} />);

describe('OverlayConfig', () => {
  beforeEach(() => {
    patch.mockClear();
    setNodes.mockClear();
    setEdges.mockClear();
    createSignedAssetUrl.mockClear();
    brandTokens = null;
    storeState = {
      nodes: [ACTION_NODE],
      edges: [],
      setNodes,
      setEdges,
      defaultEdgeType: 'bezier',
      brandId: 'brand-1',
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('writes the position preset the user picks', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('Bottom left'));
    expect(patch).toHaveBeenCalledWith(
      'act-1',
      'action',
      expect.objectContaining({ config: expect.objectContaining({ position: 'bottom-left' }) }),
    );
  });

  it('shows the op defaults, not empty controls', () => {
    renderPanel();
    // `scale` defaults to 0.15 in the frozen registry schema.
    expect(screen.getByText('15% of the frame')).toBeTruthy();
    expect(screen.getByLabelText('Top right').getAttribute('aria-pressed')).toBe('true');
  });

  it('renders an empty time window as empty, not as zero', () => {
    // `startSec`/`endSec` default to null, which means "the whole clip". Rendering 0
    // there would read as a deliberate choice the user never made.
    renderPanel();
    expect((screen.getByLabelText('Burn-in start seconds') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Burn-in end seconds') as HTMLInputElement).value).toBe('');
  });

  it('clears the window back to null, never to 0', () => {
    renderPanel({ startSec: 1, endSec: 3 });
    fireEvent.click(screen.getByText('Whole clip'));
    expect(patch).toHaveBeenCalledWith(
      'act-1',
      'action',
      expect.objectContaining({
        config: expect.objectContaining({ startSec: null, endSec: null }),
      }),
    );
  });

  it('writes a typed window', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Burn-in start seconds'), { target: { value: '1.5' } });
    expect(patch).toHaveBeenCalledWith(
      'act-1',
      'action',
      expect.objectContaining({ config: expect.objectContaining({ startSec: 1.5 }) }),
    );
  });

  it('hides the window controls on a watermark and says why', () => {
    renderPanel({}, 'video.watermark');
    expect(screen.queryByLabelText('Burn-in start seconds')).toBeNull();
    expect(screen.getByText(/covers the whole clip/i)).toBeTruthy();
  });

  it('states WHY the brand logo is unavailable instead of failing silently', () => {
    renderPanel();
    const button = screen.getByText('Brand logo').closest('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/no brand book yet/i)).toBeTruthy();
  });

  it('wires the brand logo in as a real image node when the brand has one', async () => {
    brandTokens = { logo: { storage_path: 'brand-1/branding/logo.png' } };
    renderPanel();
    const button = screen.getByText('Brand logo').closest('button');
    expect(button?.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();
    expect(createSignedAssetUrl).toHaveBeenCalledWith(
      'brand-1/branding/logo.png',
      3600,
      'brand-profile-assets',
    );
    expect(setNodes).toHaveBeenCalled();
    expect(setEdges).toHaveBeenCalled();
  });

  it('reports how many images are already wired', () => {
    storeState.edges = [{ id: 'e1', source: 'img', target: 'act-1', targetHandle: 'overlay-in' }];
    renderPanel();
    expect(screen.getByText(/1 image wired/i)).toBeTruthy();
  });
});

describe('buildOverlayImageNode', () => {
  it('lands on the action\'s "overlay-in" port, from an image node\'s "image" port', () => {
    const built = buildOverlayImageNode({
      actionNodeId: 'act-1',
      actionPosition: { x: 500, y: 300 },
      image: 'data:image/png;base64,AAAA',
      label: 'Brand logo',
    });
    expect(built.node.type).toBe('image');
    expect((built.node.data as { image?: string }).image).toBe('data:image/png;base64,AAAA');
    expect(built.edge.target).toBe('act-1');
    expect(built.edge.targetHandle).toBe('overlay-in');
    expect(built.edge.sourceHandle).toBe('image');
    expect(built.edge.source).toBe(built.node.id);
  });

  it('places the image up and to the left of the action, not on top of it', () => {
    const built = buildOverlayImageNode({
      actionNodeId: 'act-1',
      actionPosition: { x: 500, y: 300 },
      image: 'x',
      label: 'Logo',
    });
    expect(built.node.position.x).toBeLessThan(500);
    expect(built.node.position.y).toBeLessThan(300);
  });
});
