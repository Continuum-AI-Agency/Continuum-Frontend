import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DestructiveConfirmationProvider,
  useDestructiveConfirmation,
} from './DestructiveConfirmation';

Object.assign(globalThis, {
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
});

function Trigger({ onAnswer }: { onAnswer: (confirmed: boolean) => void }) {
  const { requestDestructiveConfirmation } = useDestructiveConfirmation();
  return (
    <Button
      onClick={() =>
        void requestDestructiveConfirmation({
          title: 'Publish to Instagram?',
          description: 'This posts publicly right away.',
          confirmLabel: 'Publish now',
        }).then(onAnswer)
      }
    >
      Publish
    </Button>
  );
}

function renderWithProvider(onAnswer: (confirmed: boolean) => void) {
  render(
    <DestructiveConfirmationProvider>
      <Trigger onAnswer={onAnswer} />
    </DestructiveConfirmationProvider>,
  );
  fireEvent.click(screen.getByText('Publish'));
}

describe('DestructiveConfirmationProvider', () => {
  afterEach(cleanup);

  it('shows the caller-supplied copy', () => {
    renderWithProvider(() => undefined);

    expect(screen.getByText('Publish to Instagram?')).toBeTruthy();
    expect(screen.getByText('This posts publicly right away.')).toBeTruthy();
    expect(screen.getByText('Publish now')).toBeTruthy();
  });

  it('resolves true only after the confirm action is selected', async () => {
    const answers: boolean[] = [];
    renderWithProvider((confirmed) => answers.push(confirmed));

    expect(answers).toHaveLength(0);
    fireEvent.click(screen.getByText('Publish now'));

    await waitFor(() => expect(answers).toEqual([true]));
  });

  it('resolves false when cancelled', async () => {
    const answers: boolean[] = [];
    renderWithProvider((confirmed) => answers.push(confirmed));

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => expect(answers).toEqual([false]));
  });

  // Without a provider the act proceeds, matching DraftDeletionConfirmation. The gate that
  // must never fail open (publish readiness) is enforced in usePublishDraft, not here.
  it('resolves true when no provider is mounted', async () => {
    const answers: boolean[] = [];
    render(<Trigger onAnswer={(confirmed) => answers.push(confirmed)} />);
    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() => expect(answers).toEqual([true]));
  });
});
