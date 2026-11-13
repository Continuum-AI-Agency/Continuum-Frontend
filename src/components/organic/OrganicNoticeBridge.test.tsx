import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

const show = mock();
const refresh = mock();
const revalidateBrandInsights = mock(async (_brandId: string) => undefined);

mock.module('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));
mock.module('@/lib/actions/brandInsights', () => ({ revalidateBrandInsights }));

const { OrganicNoticeBridge } = await import('./OrganicNoticeBridge');

type ShownToast = { title: string; description: string; action: { onClick: () => void } };

describe('OrganicNoticeBridge', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    show.mockClear();
    refresh.mockClear();
    revalidateBrandInsights.mockClear();
  });
  afterEach(cleanup);

  it('shows no toast for a brand with no trend report yet', () => {
    render(<OrganicNoticeBridge brandId="brand-empty" insightsError={null} />);
    expect(show).not.toHaveBeenCalled();
  });

  it('shows a real failure once per session, with its reason', () => {
    const first = render(<OrganicNoticeBridge brandId="brand-a" insightsError="Upstream 503" />);
    first.unmount();
    // A fresh page load in the same session — e.g. navigating back to the planner.
    render(<OrganicNoticeBridge brandId="brand-a" insightsError="Upstream 503" />);

    expect(show).toHaveBeenCalledTimes(1);
    const toast = show.mock.calls[0]?.[0] as ShownToast;
    expect(toast.title).toBe('Trend intelligence unavailable');
    expect(toast.description).toBe('Upstream 503');
  });

  it('Retry busts the cached read before re-rendering', async () => {
    render(<OrganicNoticeBridge brandId="brand-b" insightsError="Upstream 503" />);
    const toast = show.mock.calls[0]?.[0] as ShownToast;

    toast.action.onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(revalidateBrandInsights).toHaveBeenCalledWith('brand-b');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
