import { afterEach, describe, expect, it, vi } from 'bun:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { render } from '@/i18n/__tests__/render';
import {
  DraftDeletionConfirmationProvider,
  useDraftDeletionConfirmation,
} from './DraftDeletionConfirmation';

Object.assign(globalThis, {
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
});

function Trigger({ onDelete }: { onDelete: (ids: string[]) => void }) {
  const { requestDraftDeletion } = useDraftDeletionConfirmation();
  return (
    <Button onClick={() => requestDraftDeletion(['draft-1', 'draft-2'], onDelete)}>
      Delete drafts
    </Button>
  );
}

describe('DraftDeletionConfirmationProvider', () => {
  afterEach(cleanup);

  it('does not delete until the confirmation action is selected', () => {
    const deleteDrafts = vi.fn();
    render(
      <DraftDeletionConfirmationProvider>
        <Trigger onDelete={deleteDrafts} />
      </DraftDeletionConfirmationProvider>,
    );
    fireEvent.click(screen.getByText('Delete drafts'));
    expect(deleteDrafts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete 2 drafts'));
    expect(deleteDrafts).toHaveBeenCalledWith(['draft-1', 'draft-2']);
  });
});
