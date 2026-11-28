import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ApiError } from '@/lib/api/errors';

// The editor's stale-write contract: every save carries the version the doc was read at, the
// next save carries the version the last one returned, and a conflict keeps the user's draft.

const saveBrandMd = mock(
  async (_brandId: string, brandMd: string, _version?: string | null): Promise<unknown> => ({
    brand_md: brandMd,
    brand_md_is_edited: true,
    brand_tokens: null,
    version: 'v2',
  }),
);
const refresh = mock();
const show = mock();

mock.module('@/lib/api/brandBook.client', () => ({ saveBrandMd, resetBrandMd: mock() }));
const navigation = await import('next/navigation');
mock.module('next/navigation', () => ({ ...navigation, useRouter: () => ({ refresh }) }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));

const { BrandMdEditor } = await import('./BrandMdEditor');
const { BrandMdDirtyProvider } = await import('./BrandMdDirtyContext');

// Prose only, so the editor opens on the raw document.
const DOC = 'Acme sells bikes.';

function editAndSave(text: string) {
  fireEvent.change(screen.getByLabelText('brand.md editor'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('BrandMdEditor saves', () => {
  beforeEach(() => {
    for (const fn of [saveBrandMd, refresh, show]) fn.mockClear();
    render(
      <BrandMdDirtyProvider>
        <BrandMdEditor brandId="brand-1" initialBrandMd={DOC} isEdited={false} version="v1" canEdit />
      </BrandMdDirtyProvider>,
    );
  });
  afterEach(cleanup);

  it('sends the version it was read at, then the version the save returned', async () => {
    editAndSave('Acme rents bikes in Cali.');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(saveBrandMd.mock.calls[0]).toEqual(['brand-1', 'Acme rents bikes in Cali.', 'v1']);

    editAndSave('Acme rents bikes in Cali and Bogotá.');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(saveBrandMd.mock.calls[1]?.[2]).toBe('v2');
  });

  it('keeps the draft and explains a conflict instead of refreshing it away', async () => {
    saveBrandMd.mockImplementationOnce(async () => {
      throw new ApiError('stale', 409);
    });
    editAndSave('Acme rents bikes in Cali.');

    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show.mock.calls[0]?.[0]).toMatchObject({
      variant: 'error',
      description: expect.stringContaining('changed somewhere else'),
    });
    expect(refresh).not.toHaveBeenCalled();
    expect((screen.getByLabelText('brand.md editor') as HTMLTextAreaElement).value).toBe(
      'Acme rents bikes in Cali.',
    );
  });
});
