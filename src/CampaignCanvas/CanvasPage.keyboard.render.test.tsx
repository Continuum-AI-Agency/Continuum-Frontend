import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

// PP-DT-E-canvas-keyboard-order (deep test 2026-10-31, lane E): on /scale/campaign-canvas a
// keyboard user tabbed through the sidebar, then every edge ("Edge from 3840b0bb-…") and node of
// the Map before reaching Back to chat, the proposal picker or Map/Read — 45 Tabs on a
// four-ad-set proposal never got there, and a big account has hundreds of stops. In Read the
// hidden Map stayed in the tab order behind it. The bar comes first, and the Map is inert while
// Read covers it.

mock.module('next/navigation', () => ({
  usePathname: () => '/scale/campaign-canvas',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    replace: () => undefined,
    push: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
  }),
}));
mock.module('@/components/providers/ActiveBrandProvider', () => ({
  useActiveBrandContext: () => ({
    activeBrandId: 'brand-1',
    brandSummaries: [{ id: 'brand-1', name: 'Test Brand' }],
    user: { id: 'user-1' },
  }),
}));
mock.module('@/components/paid-media/jaina/JainaChatSurface', () => ({
  JainaChatSurface: () => <div data-testid="jaina-chat" />,
}));
mock.module('@/CampaignCanvas/components/CampaignCanvas', () => ({
  CampaignCanvas: () => (
    <div data-testid="campaign-canvas">
      <button type="button">Edge from a to b</button>
    </div>
  ),
}));
mock.module('@/CampaignCanvas/components/ScaffoldRecordBar', () => ({
  ScaffoldRecordBar: () => <div data-testid="canvas-record-bar" />,
}));

const CampaignFlowCanvasPage = (await import('./index')).default;

afterEach(() => cleanup());

/** Document order, as Tab walks it. */
const comesBefore = (first: Element, second: Element): boolean => {
  const all = Array.from(document.querySelectorAll('*'));
  return all.indexOf(first) < all.indexOf(second);
};

describe('the Canvas page keyboard order', () => {
  it('reaches Back to chat and Map/Read before any node or edge of the Map', () => {
    render(<CampaignFlowCanvasPage />);
    const back = screen.getByTestId('canvas-back-to-chat');
    const map = screen.getByTestId('campaign-canvas');
    expect(comesBefore(back, map)).toBe(true);
    const toggle = screen.getByTestId('canvas-view-toggle');
    expect(comesBefore(toggle, map)).toBe(true);
  });

  it('takes the Map out of the tab order while Read covers it', async () => {
    render(<CampaignFlowCanvasPage />);
    const map = screen.getByTestId('campaign-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(screen.getByTestId('canvas-page-read')).toBeTruthy());
    expect(map.closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    await waitFor(() => expect(screen.queryByTestId('canvas-page-read')).toBeNull());
    expect(map.closest('[inert]')).toBeNull();
  });
});
