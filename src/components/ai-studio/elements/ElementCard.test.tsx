import { afterEach, expect, test } from 'bun:test';
import type { ElementRecord } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ELEMENT_DRAG_TYPE, parseElementDragPayload } from '@/lib/ai-studio/referenceDrop';
import { ElementCard } from './ElementCard';

afterEach(cleanup);
test('a starter Element opens its existing detail and carries a real canvas Element ID', () => {
  const element: ElementRecord = {
    id: 'element-one',
    brandId: 'brand-one',
    name: 'Trail customer',
    slug: 'trail-customer',
    category: 'character',
    guidelines: null,
    rightsNote: 'Fictional adult',
    members: [],
    referenceHistory: [],
    defaultReferenceAssetId: null,
    createdAt: '',
    updatedAt: '',
  };
  let selected = '';
  render(
    <ElementCard
      element={element}
      previewUrl="https://example.com/preview.png"
      onSelect={(id) => {
        selected = id;
      }}
    />,
  );
  const button = screen.getByRole('button', { name: /Trail customer/ });
  fireEvent.click(button);
  expect(selected).toBe(element.id);
  const data = new Map<string, string>();
  fireEvent.dragStart(button, {
    dataTransfer: {
      effectAllowed: '',
      setData: (type: string, value: string) => data.set(type, value),
    },
  });
  expect(parseElementDragPayload(data.get(ELEMENT_DRAG_TYPE) ?? '')?.elementId).toBe(element.id);
});
