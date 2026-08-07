import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import { fetchBrandDocuments } from '@/lib/brands/documents';

describe('fetchBrandDocuments', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
  });

  it('maps brand document rows to onboarding documents', async () => {
    const rows = [
      {
        id: 'doc-1',
        name: ' Brand Deck ',
        source: 'google-drive',
        status: 'ready',
        size: 2048,
        storage_path: 'brands/1/deck.pdf',
        external_url: 'https://drive.google.com/file/1',
        error_message: null,
        created_at: '2026-02-26T10:00:00.000Z',
      },
      {
        id: 'doc-2',
        name: '',
        source: 'unknown',
        status: 'queued',
        size: -5,
        storage_path: null,
        external_url: null,
        error_message: '  Processing failed  ',
        created_at: '2026-02-26T10:05:00.000Z',
      },
    ];

    const order = mock(() => Promise.resolve({ data: rows, error: null }));
    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      order,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    const documents = await fetchBrandDocuments('brand-1');

    expect(documents).toEqual([
      {
        id: 'doc-1',
        name: ' Brand Deck ',
        source: 'google-drive',
        category: 'misc',
        retention: 'permanent',
        createdAt: '2026-02-26T10:00:00.000Z',
        status: 'ready',
        size: 2048,
        storagePath: 'brands/1/deck.pdf',
        externalUrl: 'https://drive.google.com/file/1',
      },
      {
        id: 'doc-2',
        name: 'Document',
        source: 'upload',
        category: 'misc',
        retention: 'permanent',
        createdAt: '2026-02-26T10:05:00.000Z',
        status: 'processing',
        errorMessage: 'Processing failed',
      },
    ]);
  });

  it('maps the lifecycle columns and prefers display_name over the stored filename', async () => {
    const rows = [
      {
        id: 'doc-3',
        name: 'chat-drop.pdf',
        display_name: 'Q3 Positioning Memo',
        source: 'upload',
        category: 'creative_strategy',
        status: 'ready',
        size: 512,
        storage_path: 'b/doc-3/v1/chat-drop.pdf',
        external_url: null,
        error_message: null,
        created_at: '2026-08-06T10:00:00.000Z',
        retention: 'ephemeral',
        expires_at: '2026-08-20T10:00:00.000Z',
        archived_at: null,
        version: 2,
      },
    ];

    const order = mock(() => Promise.resolve({ data: rows, error: null }));
    const query: any = { select: mock(() => query), eq: mock(() => query), order };
    mockCreateSupabaseServerClient.mockResolvedValue({
      schema: mock(() => ({ from: mock(() => query) })),
    } as any);

    const [document] = await fetchBrandDocuments('brand-1');

    expect(document.name).toBe('Q3 Positioning Memo');
    expect(document.retention).toBe('ephemeral');
    expect(document.expiresAt).toBe('2026-08-20T10:00:00.000Z');
    expect(document.version).toBe(2);
    expect(document.archivedAt).toBeUndefined();
  });

  // Rows written before the retention migration carry no value, and every one of them
  // is curated brand knowledge — coercing the other way would expire the whole library.
  it('defaults a missing retention to permanent', async () => {
    const rows = [
      {
        id: 'doc-4',
        name: 'legacy.pdf',
        display_name: null,
        source: 'upload',
        category: null,
        status: 'ready',
        size: null,
        storage_path: null,
        external_url: null,
        error_message: null,
        created_at: '2026-01-01T00:00:00.000Z',
        retention: null,
        expires_at: null,
        archived_at: null,
        version: null,
      },
    ];

    const order = mock(() => Promise.resolve({ data: rows, error: null }));
    const query: any = { select: mock(() => query), eq: mock(() => query), order };
    mockCreateSupabaseServerClient.mockResolvedValue({
      schema: mock(() => ({ from: mock(() => query) })),
    } as any);

    const [document] = await fetchBrandDocuments('brand-1');

    expect(document.retention).toBe('permanent');
    expect(document.name).toBe('legacy.pdf');
  });

  it('returns an empty list when query fails', async () => {
    const order = mock(() => Promise.resolve({ data: null, error: new Error('failed') }));
    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      order,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const documents = await fetchBrandDocuments('brand-2');

    expect(documents).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
