import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { brandBookResponseSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

let editorIsDirty = false;
const buildBrandSystemExport = mock(async () => ({
  archiveFileName: 'example-brand-system-2026-08-01.zip',
  pdfFileName: 'example-brand-book-2026-08-01.pdf',
  manifest: { warnings: [] },
  files: [],
}));
const downloadBrandSystemArchive = mock();
const downloadBrandBookPdf = mock();
const showToast = mock();

mock.module('./BrandMdDirtyContext', () => ({
  useBrandMdDirtyOptional: () => editorIsDirty,
}));

mock.module('@/lib/brands/brand-system-export', () => ({
  buildBrandSystemExport,
  downloadBrandSystemArchive,
  downloadBrandBookPdf,
}));

mock.module('@/lib/api/brandBook.client', () => ({
  deepenBrandBook: async () => ({ status: 'queued', jobId: 'job-1' }),
}));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: async () => undefined,
  }),
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showToast }),
}));

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

afterAll(() => mock.restore());

import { BrandBookActions } from './BrandBookActions';

const brandBook = brandBookResponseSchema.parse({
  brand_id: '11111111-1111-4111-8111-111111111111',
  status: 'ready',
  present: true,
  brand_md: '# Example Brand',
  brand_tokens: { schema_version: 1, brand_name: 'Example Brand' },
});

describe('BrandBookActions export', () => {
  beforeEach(() => {
    cleanup();
    editorIsDirty = false;
    buildBrandSystemExport.mockClear();
    downloadBrandSystemArchive.mockClear();
    downloadBrandBookPdf.mockClear();
    showToast.mockClear();
  });

  it('blocks export while brand.md has unsaved edits', () => {
    editorIsDirty = true;
    render(<BrandBookActions brandBook={brandBook} brandName="Example Brand" />);

    const trigger = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger.title).toContain('Save or discard');
  });

  it('builds and downloads the portable brand system', async () => {
    render(<BrandBookActions brandBook={brandBook} brandName="Example Brand" />);

    fireEvent.click(
      screen.getByText('Download brand system').closest('button') as HTMLButtonElement,
    );

    await waitFor(() => expect(buildBrandSystemExport).toHaveBeenCalledTimes(1));
    expect(downloadBrandSystemArchive).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Brand system exported', variant: 'success' }),
    );
  });

  it('builds and downloads the shareable PDF', async () => {
    render(<BrandBookActions brandBook={brandBook} brandName="Example Brand" />);

    fireEvent.click(screen.getByText('Download PDF').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(buildBrandSystemExport).toHaveBeenCalledTimes(1));
    expect(downloadBrandBookPdf).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Brand Book PDF exported', variant: 'success' }),
    );
  });
});
