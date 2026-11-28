import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { DocumentLayoutResponse } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { render } from '@/i18n/__tests__/render';

const calls: unknown[] = [];
const response: DocumentLayoutResponse = {
  status: 'parsed',
  fileUrl: 'https://signed/scan.png',
  mimeType: 'image/png',
  cached: true,
  layout: {
    documentId: 'doc-1',
    pageCount: 1,
    model: 'gemini-3.5-flash',
    parsedAt: '2026-11-24T00:00:00Z',
    durationMs: 1,
    regions: [
      {
        id: 'r1',
        category: 'identifiers',
        name: 'invoice_details',
        preview: 'INV-2026-0418',
        box: { page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
        confidence: 0.8,
        text: 'Invoice INV-2026-0418',
        fields: [],
        table: null,
      },
    ],
  },
};
mock.module('@/lib/documents/documentLayout.client', () => ({
  readDocumentLayout: async (input: unknown) => {
    calls.push(input);
    return response;
  },
}));

const { SentDocumentAttachments } = await import('@/components/chat/attachments');
const { DocumentInspectorProvider } = await import('./DocumentInspectorProvider');

afterEach(() => {
  cleanup();
  calls.length = 0;
});

const withQuery = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const scan = { documentId: 'doc-1', name: 'scan.png', mediaType: 'image/png' };

describe('DocumentInspectorProvider', () => {
  it('opens a chat attachment in the inspector, asking with the conversation scope', async () => {
    const { getByLabelText, findByText } = render(
      withQuery(
        <DocumentInspectorProvider brandId="b1" scopeKey="session-1">
          <SentDocumentAttachments documents={[scan]} />
        </DocumentInspectorProvider>,
      ),
    );
    await act(async () => {
      fireEvent.click(getByLabelText('Inspect scan.png'));
    });
    expect(await findByText('Inspect scan.png', { selector: 'h2' })).toBeTruthy();
    await waitFor(() =>
      expect(calls).toEqual([{ brandId: 'b1', documentId: 'doc-1', scopeKey: 'session-1' }]),
    );
    expect(await findByText(/1 region · 0 fields/)).toBeTruthy();
  });

  it('offers no Inspect where nothing can open it, or for a file it cannot draw', () => {
    const { queryByLabelText, rerender } = render(
      withQuery(<SentDocumentAttachments documents={[scan]} />),
    );
    expect(queryByLabelText('Inspect scan.png')).toBeNull();
    rerender(
      withQuery(
        <DocumentInspectorProvider brandId="b1">
          <SentDocumentAttachments
            documents={[{ ...scan, name: 'brief.docx', mediaType: 'application/msword' }]}
          />
        </DocumentInspectorProvider>,
      ),
    );
    expect(queryByLabelText('Inspect brief.docx')).toBeNull();
  });
});
