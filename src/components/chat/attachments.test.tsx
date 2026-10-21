import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { type Attachment, Attachments, SentDocumentAttachments } from './attachments';

afterEach(cleanup);

const chip = (over: Partial<Attachment>): Attachment => ({
  id: 'a1',
  kind: 'document',
  name: 'brief.pdf',
  ...over,
});

const stateOf = (container: HTMLElement, name: string) =>
  Array.from(container.querySelectorAll('[data-slot="attachment"]'))
    .find((element) => element.textContent?.includes(name))
    ?.getAttribute('data-state');

describe('Attachments (composer chips)', () => {
  it('maps every upload status onto the chip state and keeps its label', () => {
    const { container, getByText } = render(
      <Attachments
        files={[
          chip({ id: '1', name: 'up.pdf', status: 'uploading' }),
          chip({ id: '2', name: 'shot.png', kind: 'media', status: 'uploading' }),
          chip({ id: '3', name: 'idx.pdf', status: 'indexing' }),
          chip({ id: '4', name: 'tmp.pdf', status: 'ready', retention: 'ephemeral' }),
          chip({ id: '5', name: 'paste.txt', kind: 'inline-text', status: 'ready' }),
          chip({ id: '6', name: 'bad.pdf', status: 'error', error: 'Too large' }),
          chip({ id: '7', name: 'lib.pdf' }),
        ]}
      />,
    );

    expect(stateOf(container, 'up.pdf')).toBe('uploading');
    expect(getByText('Uploading…')).toBeTruthy();
    expect(getByText('Uploading to Library…')).toBeTruthy();
    expect(stateOf(container, 'idx.pdf')).toBe('processing');
    expect(getByText('Indexing…')).toBeTruthy();
    expect(stateOf(container, 'tmp.pdf')).toBe('done');
    expect(getByText('Temporary · 14d')).toBeTruthy();
    expect(getByText('Included')).toBeTruthy();
    expect(stateOf(container, 'bad.pdf')).toBe('error');
    expect(getByText('Too large')).toBeTruthy();
    expect(stateOf(container, 'lib.pdf')).toBe('done');
    expect(getByText('In Library')).toBeTruthy();
  });

  it('offers Retry only on a failed chip, and Remove on every chip', () => {
    const onRetry = mock((_id: string) => undefined);
    const onRemove = mock((_id: string) => undefined);
    const { getByRole, queryByRole } = render(
      <Attachments
        files={[
          chip({ id: 'bad', name: 'bad.pdf', status: 'error' }),
          chip({ id: 'ok', name: 'ok.pdf' }),
        ]}
        onRetry={onRetry}
        onRemove={onRemove}
      />,
    );

    expect(queryByRole('button', { name: 'Retry ok.pdf' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Retry bad.pdf' }));
    expect(onRetry).toHaveBeenCalledWith('bad');
    fireEvent.click(getByRole('button', { name: 'Remove ok.pdf' }));
    expect(onRemove).toHaveBeenCalledWith('ok');
  });

  it('renders nothing with no files', () => {
    const { container } = render(<Attachments files={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SentDocumentAttachments (transcript chips)', () => {
  it('names each document and marks a temporary one', () => {
    const { getByText } = render(
      <SentDocumentAttachments
        documents={[
          { documentId: 'd1', name: 'Q3 brief.pdf', retention: 'permanent' },
          {
            documentId: 'd2',
            name: 'notes.docx',
            retention: 'ephemeral',
            expiresAt: '2026-10-05T12:00:00.000Z',
          },
        ]}
      />,
    );

    expect(getByText('Q3 brief.pdf')).toBeTruthy();
    expect(getByText('Document')).toBeTruthy();
    expect(getByText('notes.docx')).toBeTruthy();
    expect(getByText(/^Temporary · expires /)).toBeTruthy();
  });

  it('renders nothing when the turn carried no documents', () => {
    const { container } = render(<SentDocumentAttachments documents={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
