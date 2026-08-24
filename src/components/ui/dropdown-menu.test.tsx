import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

afterEach(cleanup);

// Base UI mounts a portalled positioner per render; on a machine running several
// benches at once the first one in a file can take longer than bun's 5s default.
const RENDER_TIMEOUT_MS = 30_000;

// Base UI's Menu.Item activates on `onClick` and has no `onSelect` at all. A `<div>` DOES
// have a DOM text-selection event of that name, so React accepted the prop, TypeScript
// accepted the prop, the item rendered — and the handler never ran. Forty-odd call sites
// here were written against Radix, where onSelect WAS activation; the canvas edge-drop
// node picker was one of the dead ones.
//
// The wrapper translates onSelect to onClick. These tests fail the moment it stops. The
// same translation and the same guard live in context-menu.test.tsx.
describe('item activation', () => {
  function renderItem(props: Record<string, unknown>, label = 'Do the thing') {
    return render(
      <DropdownMenu open>
        <DropdownMenuTrigger>open me</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem {...props}>{label}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
  }

  it(
    'fires onSelect when the item is clicked',
    () => {
      const onSelect = mock(() => {});
      const { getByText } = renderItem({ onSelect });

      fireEvent.click(getByText('Do the thing'));

      expect(onSelect).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'still fires onClick',
    () => {
      const onClick = mock(() => {});
      const { getByText } = renderItem({ onClick });

      fireEvent.click(getByText('Do the thing'));

      expect(onClick).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'fires both when a call site passes both',
    () => {
      const onClick = mock(() => {});
      const onSelect = mock(() => {});
      const { getByText } = renderItem({ onClick, onSelect });

      fireEvent.click(getByText('Do the thing'));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'fires neither on a disabled item',
    () => {
      const onClick = mock(() => {});
      const onSelect = mock(() => {});
      const { getByText } = renderItem({ onClick, onSelect, disabled: true });

      fireEvent.click(getByText('Do the thing'));

      expect(onClick).toHaveBeenCalledTimes(0);
      expect(onSelect).toHaveBeenCalledTimes(0);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'translates onSelect on a checkbox item too',
    () => {
      const onSelect = mock(() => {});
      const { getByText } = render(
        <DropdownMenu open>
          <DropdownMenuTrigger>open me</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked={false} onSelect={onSelect}>
              Show archived
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );

      fireEvent.click(getByText('Show archived'));

      expect(onSelect).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );
});
