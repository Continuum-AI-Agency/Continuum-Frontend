import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createEditorProjectV2 } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VideoStudioContext } from '../types';

// list_variants is held open, so the test sees the switcher before and after it answers.
let answer: (variants: unknown[]) => void = () => undefined;
mock.module('@/lib/api/videoEditorOps.client', () => ({
  runVideoEditorOp: () =>
    new Promise((resolve) => {
      answer = (variants) => resolve({ variants });
    }),
}));
mock.module('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

const { VariantSwitcher } = await import('./VariantSwitcher');

afterEach(cleanup);

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SIBLING_ID = '33333333-3333-4333-8333-333333333333';

describe('VariantSwitcher', () => {
  it('holds "Redraft all variants" until list_variants has answered, then redrafts every sibling', async () => {
    const redrafts: number[] = [];
    const project = {
      ...createEditorProjectV2({ projectId: PROJECT_ID, title: 'A', width: 1080, height: 1920 }),
      brief: {
        briefId: 'brief-1',
        text: 'Two hooks',
        kind: 'hook' as const,
        targetDurationSec: 15,
        variantLabel: 'A',
        variantIndex: 0,
      },
    };
    const studio = {
      projectId: PROJECT_ID,
      brandId: '11111111-1111-4111-8111-111111111111',
      project,
      selection: { clipIds: [] },
      playheadSec: 0,
      runOp: (async () => ({})) as unknown as VideoStudioContext['runOp'],
      refresh: async () => undefined,
      seek: () => undefined,
      addAssetToTimeline: async () => undefined,
    } satisfies VideoStudioContext;
    render(
      <VariantSwitcher
        studio={studio}
        origin="library"
        reloadKey={0}
        onRedraft={(count) => redrafts.push(count)}
      />,
    );
    const button = screen.getByRole('button', { name: 'Redraft all variants' });
    // Before the answer the only tab is this project: a redraft now would redraft one.
    expect(button.hasAttribute('disabled')).toBe(true);
    const variant = (projectId: string, label: string, current: boolean) => ({
      projectId,
      label,
      title: label,
      durationSec: 15,
      editorPath: '',
      current,
    });
    answer([variant(PROJECT_ID, 'A', true), variant(SIBLING_ID, 'B', false)]);
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    expect(redrafts).toEqual([2]);
  });
});
