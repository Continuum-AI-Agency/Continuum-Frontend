import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UseDraftMediaPlacementResult } from '@/components/organic/hooks/useDraftMediaPlacement';

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// dnd-kit reaches for layout APIs happy-dom does not provide; the strip's contract
// here is which POSITION each control reports, not the drag physics.
mock.module('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSensor: mock(() => ({})),
  useSensors: mock((...sensors: unknown[]) => sensors),
  PointerSensor: class {},
  KeyboardSensor: class {},
  closestCenter: mock(),
}));

mock.module('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: mock(() => ({
    setNodeRef: mock(),
    attributes: {},
    listeners: {},
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
  sortableKeyboardCoordinates: {},
  horizontalListSortingStrategy: {},
}));

mock.module('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

afterAll(() => mock.restore());

import { CarouselSlideStrip } from './CarouselSlideStrip';

const placementStub = (): UseDraftMediaPlacementResult => ({
  place: mock(() => null),
  undo: mock(),
  canUndo: false,
  reorderSlides: mock(),
  removeSlide: mock(() => null),
  replaceSlide: mock(() => null),
  addSlide: mock(() => null),
  error: null,
  clearError: mock(),
});

// Deliberately sparse: this is the shape the planner actually stores. Before the fix
// the strip emitted the persisted slideIndex while the preview held an array
// position, so a thumbnail click and a chevron click landed on different slides.
const sparseSlides = [
  { storageUrl: 'https://cdn/a.jpg', storagePath: 'a.jpg' },
  { storageUrl: 'https://cdn/b.jpg', storagePath: 'b.jpg' },
  { storageUrl: 'https://cdn/c.jpg', storagePath: 'c.jpg' },
];

describe('CarouselSlideStrip', () => {
  beforeEach(() => cleanup());

  it('reports the array position of the thumbnail that was clicked', () => {
    const onSelectSlide = mock();
    render(
      <CarouselSlideStrip
        slides={sparseSlides}
        activeIndex={0}
        onSelectSlide={onSelectSlide}
        placement={placementStub()}
        onAddRequest={mock()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Slide 3'));
    expect(onSelectSlide).toHaveBeenCalledWith(2);
  });

  it('numbers thumbnails by position, so no two slides claim the same number', () => {
    render(
      <CarouselSlideStrip
        slides={sparseSlides}
        activeIndex={1}
        onSelectSlide={mock()}
        placement={placementStub()}
        onAddRequest={mock()}
      />,
    );

    expect(screen.getByLabelText('Slide 1')).toBeTruthy();
    expect(screen.getByLabelText('Slide 2 (active)')).toBeTruthy();
    expect(screen.getByLabelText('Slide 3')).toBeTruthy();
    // Position also drives the image identity — a mutated src on a reused node keeps
    // painting the previous decode.
    expect(screen.getByAltText('Slide 3').getAttribute('src')).toBe('https://cdn/c.jpg');
  });

  it('routes remove, replace and enlarge through the same position', () => {
    const placement = placementStub();
    const onReplaceRequest = mock();
    const onEnlarge = mock();
    render(
      <CarouselSlideStrip
        slides={sparseSlides}
        activeIndex={0}
        onSelectSlide={mock()}
        placement={placement}
        onAddRequest={mock()}
        onReplaceRequest={onReplaceRequest}
        onEnlarge={onEnlarge}
      />,
    );

    fireEvent.click(screen.getByLabelText('Remove slide 2'));
    fireEvent.click(screen.getByLabelText('Replace slide 2'));
    fireEvent.click(screen.getByLabelText('Enlarge slide 2'));

    expect(placement.removeSlide).toHaveBeenCalledWith(1);
    expect(onReplaceRequest).toHaveBeenCalledWith(1);
    expect(onEnlarge).toHaveBeenCalledWith(1);
  });

  it('hides remove on the last remaining slide', () => {
    render(
      <CarouselSlideStrip
        slides={[sparseSlides[0]]}
        activeIndex={0}
        onSelectSlide={mock()}
        placement={placementStub()}
        onAddRequest={mock()}
      />,
    );
    expect(screen.queryByLabelText('Remove slide 1')).toBeNull();
  });
});
