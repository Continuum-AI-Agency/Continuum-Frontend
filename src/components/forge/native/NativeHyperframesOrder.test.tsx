import { afterEach, expect, test } from 'bun:test';
import type { HyperframesOrderView } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { NativeHyperframesOrder } from './NativeHyperframesOrder';
import { nativeOrderDefaults } from './nativeEditorEdits';

afterEach(cleanup);
const id = '11111111-1111-4111-8111-111111111111';
const view: HyperframesOrderView = {
  schema: 'hyperframes.order-view/1',
  brandId: id,
  assetId: id,
  revisionId: id,
  sourceVersionId: id,
  sourceSha256: 'a'.repeat(64),
  sceneSha256: 'b'.repeat(64),
  sourceSceneSha256: 'b'.repeat(64),
  groups: [
    {
      parentId: 'root',
      parentTag: 'div',
      children: Array.from({ length: 21 }, (_, index) => ({ nodeId: `node-${index}`, tag: 'div' })),
    },
  ],
};

test('source order bounds mounted controls and moving across pages retains every child', () => {
  let latest = nativeOrderDefaults(view);
  function Harness() {
    const [value, setValue] = useState(latest);
    return (
      <NativeHyperframesOrder
        view={view}
        value={value}
        onChange={(next) => {
          latest = next;
          setValue(next);
        }}
      />
    );
  }
  render(<Harness />);
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: 'Move node-19 later' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(latest[0]!.nodeIds).toEqual([
    ...Array.from({ length: 19 }, (_, index) => `node-${index}`),
    'node-20',
    'node-19',
  ]);
  expect(
    (screen.getByRole('button', { name: 'Move node-19 later' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Move node-19 earlier' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
  expect(latest).toEqual(nativeOrderDefaults(view));
});
