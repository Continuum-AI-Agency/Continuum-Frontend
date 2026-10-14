import { afterEach, expect, test } from 'bun:test';
import { DndContext } from '@dnd-kit/core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { TimelineInputSource } from '../../types';
import { editorSourceRef } from './editorProjectV2AssemblyModel';
import { MediaBin } from './MediaBin';

afterEach(cleanup);

test('a refused motion profile remains visible and cannot create a timeline source', () => {
  let placements = 0;
  const source: TimelineInputSource = {
    nodeId: 'motion', kind: 'video', label: 'Motion graphic',
    unavailableReason: 'Motion graphic unavailable for video overlays.',
  };
  const { getByLabelText, getByText } = render(
    <DndContext><MediaBin pool={[source]} onPlace={() => { placements += 1; }} /></DndContext>,
  );
  expect(getByText(source.unavailableReason!)).toBeDefined();
  const add = getByLabelText('Add Motion graphic to the timeline') as HTMLButtonElement;
  expect(add.disabled).toBe(true);
  add.click();
  fireEvent.doubleClick(add.closest('div[aria-disabled="true"]')!);
  expect(placements).toBe(0);
  expect(() => editorSourceRef(source)).toThrow(source.unavailableReason);
});
