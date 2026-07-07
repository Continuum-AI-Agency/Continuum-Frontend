import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

afterAll(() => mock.restore());

import { MediaLightbox } from './MediaLightbox';

const ITEMS = [
  { url: 'https://cdn/1.png', caption: 'Frame 1 · hook' },
  { url: 'https://cdn/2.png', caption: 'Frame 2 · payoff' },
];

function setup(overrides: Partial<Parameters<typeof MediaLightbox>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: mock(),
    title: 'Blueprint concept',
    items: ITEMS,
    index: 0,
    onIndexChange: mock(),
    actions: <button type="button">Generate final media</button>,
    ...overrides,
  };
  render(<MediaLightbox {...props} />);
  return props;
}

describe('MediaLightbox', () => {
  beforeEach(() => cleanup());

  it('shows the title, current caption, image, and provided actions', () => {
    setup({ index: 0 });
    expect(screen.getByText('Blueprint concept')).toBeTruthy();
    expect(screen.getByText('Frame 1 · hook')).toBeTruthy();
    expect(screen.getByAltText('Frame 1 · hook')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate final media' })).toBeTruthy();
  });

  it('advances to the next item within bounds', () => {
    const { onIndexChange } = setup({ index: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Next creative' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('disables previous at the first item and next at the last', () => {
    const { onIndexChange } = setup({ index: 0 });
    const prev = screen.getByRole('button', { name: 'Previous creative' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(prev);
    expect(onIndexChange).not.toHaveBeenCalled();

    cleanup();
    setup({ index: 1 });
    const next = screen.getByRole('button', { name: 'Next creative' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('hides navigation for a single item', () => {
    setup({ items: [ITEMS[0]], index: 0 });
    expect(screen.queryByRole('button', { name: 'Next creative' })).toBeNull();
  });

  it('renders a video element for video items', () => {
    const { container } = render(
      <MediaLightbox
        open
        onOpenChange={mock()}
        title="Creative"
        items={[{ url: 'https://cdn/clip.mp4', caption: 'Reel', isVideo: true }]}
        index={0}
        onIndexChange={mock()}
      />,
    );
    expect(container.querySelector('video')).toBeTruthy();
  });
});
