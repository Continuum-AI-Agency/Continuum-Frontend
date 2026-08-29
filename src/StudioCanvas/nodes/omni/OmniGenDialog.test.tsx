import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { OmniVariation } from '../../types';
import { OmniGenDialog, type OmniGenDialogProps } from './OmniGenDialog';

const done = (id: string, overrides: Partial<OmniVariation> = {}): OmniVariation => ({
  id,
  label: id,
  status: 'done',
  videoUrl: `https://example.com/${id}.mp4`,
  interactionId: `v1_${id}`,
  createdAt: 0,
  ...overrides,
});

type Calls = {
  generate: string[];
  turn: string[];
  prompt: string[];
  resolution: string[];
  selected: string[];
  videoTask: string[];
};

const renderDialog = (overrides: Partial<OmniGenDialogProps> = {}) => {
  const calls: Calls = {
    generate: [],
    turn: [],
    prompt: [],
    resolution: [],
    selected: [],
    videoTask: [],
  };
  const props: OmniGenDialogProps = {
    open: true,
    onOpenChange: () => undefined,
    aspectRatio: '16:9',
    resolution: '720p',
    videoTask: 'edit',
    prompt: '',
    variations: [],
    activeVariation: undefined,
    videoInput: undefined,
    onAspectRatioChange: () => undefined,
    onResolutionChange: (value) => calls.resolution.push(value),
    onVideoTaskChange: (value) => calls.videoTask.push(value),
    onPromptChange: (value) => calls.prompt.push(value),
    onSelectVariation: (variation) => calls.selected.push(variation.id),
    onGenerate: (value) => calls.generate.push(value),
    onSubmitTurn: (value) => calls.turn.push(value),
    onDownload: () => undefined,
    ...overrides,
  };
  const view = render(
    <ToastProvider>
      <OmniGenDialog {...props} />
    </ToastProvider>,
  );
  return { calls, props, view };
};

afterEach(cleanup);

describe('OmniGenDialog', () => {
  it('generates with the drafted prompt when the node has no chain', async () => {
    const { calls, view } = renderDialog();
    const textarea = view.getByRole('textbox') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'a marble on a track' } });
    });
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /generate/i }));
    });

    expect(calls.generate).toEqual(['a marble on a track']);
    expect(calls.turn).toEqual([]);
  });

  // One textarea, two meanings. An instruction is one-shot: writing it into
  // data.prompt would make the next Run re-send "make the sky orange" as the
  // whole brief.
  it('sends an edit against the active clip and never overwrites the node prompt', async () => {
    const active = done('v1');
    const { calls, view } = renderDialog({
      prompt: 'the original brief',
      variations: [active],
      activeVariation: active,
    });
    const textarea = view.getByRole('textbox') as HTMLTextAreaElement;

    expect(textarea.value).toBe('');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'make the sky sunset orange' } });
    });
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /send edit/i }));
    });

    expect(calls.turn).toEqual(['make the sky sunset orange']);
    expect(calls.generate).toEqual([]);
    expect(calls.prompt).toEqual([]);
  });

  it('submits on Cmd+Enter', async () => {
    const { calls, view } = renderDialog();
    const textarea = view.getByRole('textbox') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'a marble' } });
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    });

    expect(calls.generate).toEqual(['a marble']);
  });

  // The in-flight marker lives in the node, not in this component, so closing the
  // editor mid-turn and reopening it must not lose the spinner.
  it('keeps the turn pending across a close and reopen', async () => {
    const pending: OmniVariation = {
      id: 'v2',
      label: 'pending',
      status: 'pending',
      createdAt: 1,
    };
    const variations = [done('v1'), pending];
    const { view, props } = renderDialog({ variations, activeVariation: pending });

    // The dialog renders through a portal, so it lives on baseElement, not container.
    const pendingSpinner = () => view.baseElement.querySelector('.animate-spin');
    expect(pendingSpinner()).not.toBeNull();
    expect((view.getByRole('button', { name: /send edit/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await act(async () => {
      view.rerender(
        <ToastProvider>
          <OmniGenDialog {...props} open={false} />
        </ToastProvider>,
      );
    });
    await act(async () => {
      view.rerender(
        <ToastProvider>
          <OmniGenDialog {...props} open={true} />
        </ToastProvider>,
      );
    });

    await waitFor(() => expect(pendingSpinner()).not.toBeNull());
    expect((view.getByRole('button', { name: /send edit/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('only selects finished variations', async () => {
    const first = done('v1');
    const broken: OmniVariation = { id: 'v2', label: 'x', status: 'error', createdAt: 1 };
    const { calls, view } = renderDialog({
      variations: [first, broken],
      activeVariation: first,
    });

    const tiles = Array.from(
      view.baseElement.querySelectorAll('[data-testid="omni-variation-tile"]'),
    );
    expect(tiles.length).toBe(2);
    for (const tile of tiles) {
      await act(async () => {
        fireEvent.click(tile);
      });
    }

    expect(calls.selected).toContain('v1');
    expect(calls.selected).not.toContain('v2');
  });

  it('defaults to 720p and reports a resolution change', async () => {
    const { calls, view } = renderDialog();
    const select = view.getByLabelText('Resolution') as HTMLSelectElement;

    expect(select.value).toBe('720p');
    await act(async () => {
      fireEvent.change(select, { target: { value: '4k' } });
    });

    expect(calls.resolution).toEqual(['4k']);
  });

  it('shows the edit/extend control only when a clip is wired in', async () => {
    const withoutClip = renderDialog();
    expect(withoutClip.view.queryByLabelText('What to do with the wired clip')).toBeNull();
    cleanup();

    const withClip = renderDialog({ videoInput: { label: 'Reel cut' } });
    const control = withClip.view.getByLabelText(
      'What to do with the wired clip',
    ) as HTMLSelectElement;
    expect(control.value).toBe('edit');

    await act(async () => {
      fireEvent.change(control, { target: { value: 'extend' } });
    });
    expect(withClip.calls.videoTask).toEqual(['extend']);
  });
});
