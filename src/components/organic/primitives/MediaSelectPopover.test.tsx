import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const ASSETS = [
  { id: 'a1', kind: 'image', signedUrl: 'https://cdn/a1.jpg', fileName: 'a1', title: 'Asset One' },
  { id: 'a2', kind: 'image', signedUrl: 'https://cdn/a2.jpg', fileName: 'a2', title: 'Asset Two' },
  { id: 'v1', kind: 'video', signedUrl: 'https://cdn/v1.mp4', fileName: 'v1', title: 'Clip One' },
  { id: 'v2', kind: 'video', signedUrl: 'https://cdn/v2.mp4', fileName: 'v2', title: 'Clip Two' },
];

mock.module('@/lib/creative-assets/useStudioLibraryBrowser', () => ({
  useStudioLibraryBrowser: () => ({
    assets: ASSETS,
    loading: false,
    hasMore: false,
    loadMore: mock(),
    query: '',
    setQuery: mock(),
    filters: { source: 'all', kind: 'all' },
    setFilters: mock(),
  }),
}));

mock.module('@/components/library/LibraryFilterBar', () => ({
  LibraryFilterBar: () => <div data-testid="filter-bar" />,
}));
mock.module('@/lib/creative-assets/assetUrl', () => ({
  sanitizeCreativeAssetUrl: (u: string) => u,
}));

mock.module('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

afterAll(() => mock.restore());

import { MediaSelectPopover } from './MediaSelectPopover';

function setup(overrides: Partial<Parameters<typeof MediaSelectPopover>[0]> = {}) {
  const props = {
    brandProfileId: 'brand-1',
    open: true,
    onOpenChange: mock(),
    anchor: <div data-testid="anchor" />,
    onAttachAssets: mock(),
    ...overrides,
  };
  render(<MediaSelectPopover {...props} />);
  return props;
}

describe('MediaSelectPopover', () => {
  beforeEach(() => cleanup());

  it('renders the anchor and the library grid', () => {
    setup();
    expect(screen.getByTestId('anchor')).toBeTruthy();
    expect(screen.getByLabelText('Asset One')).toBeTruthy();
    expect(screen.getByLabelText('Asset Two')).toBeTruthy();
  });

  it('attaches the selected assets through the unified write path and closes', () => {
    const onAttachAssets = mock();
    const onOpenChange = mock();
    setup({ onAttachAssets, onOpenChange });

    fireEvent.click(screen.getByLabelText('Asset One'));
    fireEvent.click(screen.getByText(/Attach/));

    expect(onAttachAssets).toHaveBeenCalledTimes(1);
    const passed = onAttachAssets.mock.calls[0][0] as Array<{ id: string }>;
    expect(passed.map((a) => a.id)).toEqual(['a1']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('preserves multi-select order (carousel slide order)', () => {
    const onAttachAssets = mock();
    setup({ onAttachAssets });
    fireEvent.click(screen.getByLabelText('Asset Two'));
    fireEvent.click(screen.getByLabelText('Asset One'));
    fireEvent.click(screen.getByText(/Attach/));
    const passed = onAttachAssets.mock.calls[0][0] as Array<{ id: string }>;
    expect(passed.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('shows Generate only when allowed and routes the click', () => {
    const onGenerate = mock();
    const onOpenChange = mock();
    setup({ canGenerate: true, onGenerate, onOpenChange });
    fireEvent.click(screen.getByText('Generate'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('hides Generate when not allowed', () => {
    setup({ canGenerate: false, onGenerate: mock() });
    expect(screen.queryByText('Generate')).toBeNull();
  });
});

// A post has exactly one video slot. Before this, two selected videos were sent to
// a `{kind:'single'}` target and `shapeUserSuppliedMedia` kept only the first —
// the attach looked successful while quietly discarding the rest of the picks.
describe('MediaSelectPopover — one video per post', () => {
  beforeEach(() => cleanup());

  it('attaches a single selected video', () => {
    const onAttachAssets = mock();
    setup({ onAttachAssets });
    fireEvent.click(screen.getByLabelText('Clip One'));
    expect(screen.queryByText('Only one video per post')).toBeNull();
    fireEvent.click(screen.getByText(/Attach/));
    expect((onAttachAssets.mock.calls[0][0] as Array<{ id: string }>).map((a) => a.id)).toEqual([
      'v1',
    ]);
  });

  it('blocks two videos with a message and a disabled Attach', () => {
    const onAttachAssets = mock();
    setup({ onAttachAssets });
    fireEvent.click(screen.getByLabelText('Clip One'));
    fireEvent.click(screen.getByLabelText('Clip Two'));

    expect(screen.getByText('Only one video per post')).toBeTruthy();
    const attach = screen.getByText(/Attach/).closest('button') as HTMLButtonElement;
    expect(attach.disabled).toBe(true);

    fireEvent.click(attach);
    expect(onAttachAssets).not.toHaveBeenCalled();
  });

  it('re-enables Attach once the extra video is deselected', () => {
    const onAttachAssets = mock();
    setup({ onAttachAssets });
    fireEvent.click(screen.getByLabelText('Clip One'));
    fireEvent.click(screen.getByLabelText('Clip Two'));
    fireEvent.click(screen.getByLabelText('Clip Two'));

    expect(screen.queryByText('Only one video per post')).toBeNull();
    fireEvent.click(screen.getByText(/Attach/));
    expect(onAttachAssets).toHaveBeenCalledTimes(1);
  });

  it('leaves multi-image carousel selection untouched', () => {
    const onAttachAssets = mock();
    setup({ onAttachAssets });
    fireEvent.click(screen.getByLabelText('Asset One'));
    fireEvent.click(screen.getByLabelText('Asset Two'));
    expect(screen.queryByText('Only one video per post')).toBeNull();
    fireEvent.click(screen.getByText(/Attach/));
    expect((onAttachAssets.mock.calls[0][0] as Array<{ id: string }>).map((a) => a.id)).toEqual([
      'a1',
      'a2',
    ]);
  });
});
