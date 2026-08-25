import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

// Base UI's dialog measures itself and watches the tree on open; happy-dom only exposes
// these off the window instance.
global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
(global as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;

import { type BatchItem, MAX_BATCH_ITEMS } from '@continuum/contracts';

import type { NodeOutput } from '../../types/execution';
import { batchMatrix } from '../../utils/batch/matrix';
import { MatrixResultsDialog } from './MatrixResultsDialog';

const textItem = (value: string): BatchItem => ({ id: `t-${value}`, kind: 'text', value });
const textOutput = (value: string): NodeOutput => ({ type: 'text', value });

const renderMatrix = (layout: ReturnType<typeof batchMatrix>) =>
  render(<MatrixResultsDialog open onOpenChange={() => {}} layout={layout} />);

describe('MatrixResultsDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('gives a 3 × 1 cross product one row per left item', () => {
    renderMatrix(
      batchMatrix({
        combine: 'cross',
        left: [textItem('a'), textItem('b'), textItem('c')],
        right: [textItem('x')],
        outputs: [textOutput('ax'), textOutput('bx'), textOutput('cx')],
      }),
    );

    expect(screen.getAllByTestId('batch-matrix-row')).toHaveLength(3);
    expect(screen.getAllByTestId('batch-matrix-cell')).toHaveLength(3);
    expect(screen.getByText('ax')).toBeDefined();
  });

  it('names the cap instead of blanking the cell it never ran', () => {
    const left = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_unused, index) =>
      textItem(`row-${index}`),
    );
    renderMatrix(batchMatrix({ combine: 'zip', left, outputs: [] }));

    expect(screen.getByText(`not run (${MAX_BATCH_ITEMS} cap)`)).toBeDefined();
  });

  it('says a missing output failed rather than showing nothing', () => {
    renderMatrix(
      batchMatrix({
        combine: 'cross',
        left: [textItem('a'), textItem('b')],
        right: [textItem('x')],
        outputs: [textOutput('ax'), null],
      }),
    );

    expect(screen.getByText('failed')).toBeDefined();
  });

  it('renders a zip pairing as a single result column, not a mostly-empty square', () => {
    renderMatrix(
      batchMatrix({
        combine: 'zip',
        left: [textItem('a'), textItem('b'), textItem('c')],
        right: [textItem('x'), textItem('y'), textItem('z')],
        outputs: [textOutput('ax'), textOutput('by'), textOutput('cz')],
      }),
    );

    expect(screen.getByText('Result')).toBeDefined();
    expect(screen.getAllByTestId('batch-matrix-row')).toHaveLength(3);
    expect(screen.getAllByTestId('batch-matrix-cell')).toHaveLength(3);
  });
});
