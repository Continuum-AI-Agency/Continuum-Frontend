import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

afterAll(() => mock.restore());

import { BlueprintStoryboard, resolveStoryboardFrames } from './BlueprintStoryboard';
import type { OrganicCalendarDraft } from './types';

const FRAMES = [
  { storageUrl: 'https://cdn/f1.png', role: 'hook' },
  { storageUrl: 'https://cdn/f2.png', role: null },
];

function setup(overrides: Partial<Parameters<typeof BlueprintStoryboard>[0]> = {}) {
  const props = {
    frames: FRAMES,
    alt: 'Test post',
    canGenerate: true,
    isGenerating: false,
    onGenerate: mock(),
    onUseOwn: mock(),
    onEnlargeFrame: mock(),
    ...overrides,
  };
  render(<BlueprintStoryboard {...props} />);
  return props;
}

describe('BlueprintStoryboard', () => {
  beforeEach(() => cleanup());

  it('renders every frame with its role label and alt text', () => {
    setup();
    expect(screen.getByAltText('Test post — storyboard frame 1')).toBeTruthy();
    expect(screen.getByAltText('Test post — storyboard frame 2')).toBeTruthy();
    // Role tag rendered when present; the frame-index caption is always present.
    expect(screen.getByText(/· hook/)).toBeTruthy();
  });

  it('the primary CTA generates final media when generation is available', () => {
    const { onGenerate } = setup({ canGenerate: true });
    fireEvent.click(screen.getByRole('button', { name: 'Generate final media' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('disables the primary CTA and shows a hint until setup finishes', () => {
    const { onGenerate } = setup({ canGenerate: false });
    const cta = screen.getByRole('button', { name: 'Generate final media' });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cta);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByText(/Finishing setup/)).toBeTruthy();
  });

  it("reflects an in-flight realize as a disabled 'Generating…' state", () => {
    setup({ isGenerating: true });
    const cta = screen.getByRole('button', { name: /Generating final media/ });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });

  it("the secondary action opens the user's own creative flow", () => {
    const { onUseOwn } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Use your own creative' }));
    expect(onUseOwn).toHaveBeenCalledTimes(1);
  });

  it('enlarges the clicked frame by its index', () => {
    const { onEnlargeFrame } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Enlarge storyboard frame 2/ }));
    expect(onEnlargeFrame).toHaveBeenCalledWith(1);
  });

  it('collapses frames beyond the visible cap into a +N indicator', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      storageUrl: `https://cdn/f${i}.png`,
      role: null,
    }));
    setup({ frames: many });
    expect(screen.getByText('+2')).toBeTruthy();
  });
});

describe('resolveStoryboardFrames', () => {
  it('keeps only frames that carry a usable signed URL', () => {
    const draft = {
      mediaSuggestion: {
        storyboard: [
          { role: 'a', storageUrl: 'https://cdn/1.png' },
          { role: 'b', storageUrl: '' },
          { role: 'c' },
        ],
      },
    } as unknown as OrganicCalendarDraft;
    const frames = resolveStoryboardFrames(draft);
    expect(frames).toHaveLength(1);
    expect(frames[0].storageUrl).toBe('https://cdn/1.png');
  });
});
