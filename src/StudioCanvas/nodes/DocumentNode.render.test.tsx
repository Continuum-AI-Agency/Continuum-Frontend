/**
 * #298 — "Document context lags the page / It doesn't read it."
 *
 * Every case here mounts the node AFTER the document already reached its state. That is
 * the case the old code could not pass and no test covered: `useDocuments` did no
 * initial read and only listened for changes from the moment of mount, so a document
 * that finished, failed, or died before the canvas opened never entered its map — and
 * `resolveDocStatus` called anything it had not heard of "processing", forever.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { CanvasDocument, DocumentNodeData } from '../types';

const BRAND = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

/** Rows the fake `brand_documents` table hands back, per test. */
let tableRows: Row[] = [];
/** Every `.update()` payload the hook wrote back, with the ids it targeted. */
const writes: Array<{ patch: Row; ids: unknown; guard: [string, unknown] }> = [];

// Realtime is silenced on purpose: this suite is about the state that was already
// reached, so any chip that turns correct here did so from a real read of the table.
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: () => () => {},
}));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: async () => ({ data: tableRows, error: null }) }),
            order: async () => ({ data: tableRows, error: null }),
          }),
        }),
        update: (patch: Row) => ({
          in: (_column: string, ids: unknown) => ({
            eq: async (column: string, value: unknown) => {
              writes.push({ patch, ids, guard: [column, value] });
              return { error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

const { DocumentNode, foldAttachedDocument } = await import('./DocumentNode');

function row(overrides: Row): Row {
  return {
    id: DOC_ID,
    brand_id: BRAND,
    name: 'three-pager.pdf',
    display_name: 'three-pager.pdf',
    source: 'upload',
    created_at: '2026-06-02T06:37:41.771Z',
    updated_at: '2026-06-02T06:37:41.810Z',
    ...overrides,
  };
}

function renderNode(documents: CanvasDocument[]) {
  return renderNodeData({ documents });
}

function renderNodeData(data: DocumentNodeData) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <DocumentNode
          id="doc-1"
          type="document"
          data={data}
          selected={false}
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable
          selectable
          deletable
        />
      </ReactFlowProvider>
    </ToastProvider>,
  );
}

const linked: CanvasDocument[] = [
  { name: 'three-pager.pdf', type: 'pdf', sourceDocumentId: DOC_ID },
];

describe('DocumentNode — mounted after the document reached its state', () => {
  beforeEach(() => {
    tableRows = [];
    writes.length = 0;
    useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('reads a document that finished long before the canvas opened', async () => {
    tableRows = [row({ status: 'ready', progress_step: 'ready' })];

    renderNode(linked);

    await waitFor(() => expect(screen.getByText('pdf · ready')).toBeDefined());
    expect(screen.queryByText('processing…')).toBeNull();
  });

  it('says why a document failed instead of spinning on it', async () => {
    tableRows = [
      row({
        status: 'error',
        progress_step: 'error',
        error_code: 'EMPTY_TEXT',
        error_message: 'No extractable text found.',
      }),
    ];

    renderNode(linked);

    await waitFor(() => expect(screen.getByText('No extractable text found.')).toBeDefined());
    expect(screen.queryByText('processing…')).toBeNull();
  });

  it('fails a document the server stopped talking about, and records it on the row', async () => {
    // The real shape of the two rows stuck since 2026-06-02: still `processing`, still
    // 'extracting', with an updated_at three months old.
    tableRows = [row({ status: 'processing', progress_step: 'extracting', progress_percent: 0 })];

    renderNode(linked);

    await waitFor(() => expect(screen.getByText(/Processing timed out/i)).toBeDefined());
    // The verdict is written back, or the row stays `processing` in the database for
    // every other reader — which is exactly how it survived three months.
    expect(writes).toHaveLength(1);
    expect(writes[0].patch).toMatchObject({ status: 'error', progress_step: 'error' });
    expect(writes[0].ids).toEqual([DOC_ID]);
    expect(writes[0].guard).toEqual(['status', 'processing']);
  });

  it('a document that is genuinely still processing keeps its spinner', async () => {
    tableRows = [
      row({
        status: 'processing',
        progress_step: 'embedding',
        updated_at: new Date().toISOString(),
      }),
    ];

    renderNode(linked);

    await waitFor(() => expect(screen.getByText('embedding')).toBeDefined());
    expect(writes).toHaveLength(0);
  });

  it('calls a document the library does not have unavailable, not processing', async () => {
    tableRows = [];

    renderNode(linked);

    await waitFor(() => expect(screen.getByText('unavailable')).toBeDefined());
    expect(screen.queryByText('processing…')).toBeNull();
  });
});

// What workflow-builder's `attach_media` writes onto a document node: the Library
// pointer at the TOP level, where no document consumer looks.
const ASSET = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const agentAttached = {
  assetId: ASSET,
  assetVersionId: VERSION,
  sourcePath: 'brand/library/brief.pdf',
  bucket: 'media-library',
  fileName: 'brief.pdf',
} as DocumentNodeData;

describe('DocumentNode — a document an agent attached', () => {
  beforeEach(() => {
    tableRows = [];
    useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('moves the top-level Library pointer into a documents entry', () => {
    const patch = foldAttachedDocument(agentAttached) as Record<string, unknown>;

    expect(patch.documents).toEqual([
      {
        name: 'brief.pdf',
        type: 'pdf',
        storagePath: 'brand/library/brief.pdf',
        bucket: 'media-library',
        assetId: ASSET,
        assetVersionId: VERSION,
        sourceUrl: undefined,
      },
    ]);
    // Moved, not copied: removing the chip must not bring it back on the next render.
    for (const key of ['assetId', 'assetVersionId', 'sourcePath', 'bucket', 'fileName']) {
      expect(key in patch && patch[key] === undefined).toBe(true);
    }
  });

  it('does not add a second entry for a document the node already holds', () => {
    const held: CanvasDocument = {
      name: 'brief.pdf',
      type: 'pdf',
      storagePath: 'brand/library/brief.pdf',
      bucket: 'media-library',
    };
    const patch = foldAttachedDocument({ ...agentAttached, documents: [held] });
    expect(patch?.documents).toEqual([held]);
  });

  it('leaves a node with no attachment alone', () => {
    expect(foldAttachedDocument({ documents: [] })).toBeNull();
  });

  it('writes the folded entry to the canvas when the node mounts', async () => {
    useStudioStore.setState({
      brandId: BRAND,
      nodes: [{ id: 'doc-1', type: 'document', position: { x: 0, y: 0 }, data: agentAttached }],
      edges: [],
    });

    renderNodeData(agentAttached);

    await waitFor(() => {
      const data = useStudioStore.getState().nodes[0]?.data as DocumentNodeData &
        Record<string, unknown>;
      expect(data.documents?.[0]).toMatchObject({
        name: 'brief.pdf',
        assetId: ASSET,
        assetVersionId: VERSION,
        storagePath: 'brand/library/brief.pdf',
        bucket: 'media-library',
      });
      expect(data.sourcePath).toBeUndefined();
    });
  });
});
