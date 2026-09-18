import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const preview = mock(async () => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  expectedVersionId: '22222222-2222-4222-8222-222222222222',
  versionId: '33333333-3333-4333-8333-333333333333',
  checksum: 'a'.repeat(64),
  requiresReview: true,
  slots: [{ slotKey: 'headline', name: 'Headline', kind: 'text', status: 'missing' as const }],
}));
const confirm = mock(async () => preview());
const uploadNewAssetVersion = mock(async (_input: { file: File }) => ({
  versionId: '33333333-3333-4333-8333-333333333333',
}));

// The real module's other exports ride along: Bun keeps one module registry for a multi-file run,
// and a mock carrying only this panel's names fails every other file that imports a different one.
const templateSources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...templateSources,
  previewTemplateRebind: preview,
  confirmTemplateRebind: confirm,
}));
mock.module('@/lib/library/versions', () => ({
  listAssetVersions: async () => [
    {
      id: '22222222-2222-4222-8222-222222222222',
      versionNumber: 1,
      fileName: 'campaign-v1.aep',
      isHead: false,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      versionNumber: 2,
      fileName: 'campaign-v2.aep',
      isHead: true,
    },
  ],
  uploadNewAssetVersion,
}));

const { SourceRebindPanel } = await import('./SourceRebindPanel');
const { registerToastSink } = await import('@/components/ui/toast-imperative');

const toasts: string[] = [];
registerToastSink((options) => {
  toasts.push(String(options.title));
});

beforeEach(() => {
  preview.mockClear();
  confirm.mockClear();
  uploadNewAssetVersion.mockClear();
  toasts.length = 0;
});
afterEach(cleanup);

describe('SourceRebindPanel', () => {
  test('a delayed preview cannot move to another source', async () => {
    let resolve: (value: Awaited<ReturnType<typeof preview>>) => void = () => undefined;
    preview.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const props = {
      brandId: '44444444-4444-4444-8444-444444444444',
      assetId: '11111111-1111-4111-8111-111111111111',
      expectedVersionId: '22222222-2222-4222-8222-222222222222',
      onConfirmed: async () => undefined,
    };
    const view = render(<SourceRebindPanel {...props} />);
    fireEvent.change(screen.getByLabelText('Upload new revision'), {
      target: { files: [new File(['project'], 'campaign-v2.aep')] },
    });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.rerender(<SourceRebindPanel {...props} assetId="55555555-5555-4555-8555-555555555555" />);
    await act(async () =>
      resolve({
        ...props,
        versionId: '33333333-3333-4333-8333-333333333333',
        checksum: 'a'.repeat(64),
        requiresReview: true,
        slots: [{ slotKey: 'headline', name: 'Headline', kind: 'text', status: 'missing' }],
      }),
    );
    expect(screen.queryByRole('button', { name: 'Use this revision' })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
  test('requires explicit missing-slot acceptance and confirms the reviewed checksum', async () => {
    const refreshed = mock(async () => undefined);
    render(
      <SourceRebindPanel
        brandId="44444444-4444-4444-8444-444444444444"
        assetId="11111111-1111-4111-8111-111111111111"
        expectedVersionId="22222222-2222-4222-8222-222222222222"
        onConfirmed={refreshed}
      />,
    );
    fireEvent.change(screen.getByLabelText('Upload new revision'), {
      target: { files: [new File(['project'], 'campaign-v2.aep')] },
    });
    expect(await screen.findByText('missing')).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Use this revision' }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByText('Accept missing slots in this revision'));
    fireEvent.click(screen.getByRole('button', { name: 'Use this revision' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      expectedChecksum: 'a'.repeat(64),
      acceptMissing: true,
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  test('refuses an ambiguous preview', async () => {
    preview.mockImplementationOnce(async () => ({
      assetId: '11111111-1111-4111-8111-111111111111',
      expectedVersionId: '22222222-2222-4222-8222-222222222222',
      versionId: '33333333-3333-4333-8333-333333333333',
      checksum: 'a'.repeat(64),
      requiresReview: true,
      slots: [{ slotKey: 'hero', kind: 'image', status: 'ambiguous' as const }],
    }));
    render(
      <SourceRebindPanel
        brandId="44444444-4444-4444-8444-444444444444"
        assetId="11111111-1111-4111-8111-111111111111"
        expectedVersionId="22222222-2222-4222-8222-222222222222"
        onConfirmed={async () => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Upload new revision'), {
      target: { files: [new File(['project'], 'campaign-v2.aep')] },
    });
    expect(await screen.findByText(/Ambiguous slots must be resolved/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Use this revision' }).disabled,
    ).toBe(true);
  });

  test('a file handed over from a gallery drop is uploaded once, on arrival, and compared', async () => {
    const dropped = new File(['project v3'], 'campaign.aep');
    const taken = mock(() => undefined);
    const props = {
      brandId: '44444444-4444-4444-8444-444444444444',
      assetId: '11111111-1111-4111-8111-111111111111',
      expectedVersionId: '22222222-2222-4222-8222-222222222222',
      onConfirmed: async () => undefined,
      initialFile: dropped,
      onInitialFileTaken: taken,
    };
    const view = render(<SourceRebindPanel {...props} />);
    expect(await screen.findByRole('button', { name: 'Use this revision' })).toBeTruthy();
    view.rerender(<SourceRebindPanel {...props} />);
    expect(uploadNewAssetVersion).toHaveBeenCalledTimes(1);
    expect(uploadNewAssetVersion.mock.calls[0]?.[0].file).toBe(dropped);
    expect(taken).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledTimes(1);
  });

  test("storage's size refusal comes back as a sentence naming the limit", async () => {
    uploadNewAssetVersion.mockImplementationOnce(async () => {
      throw new Error('resumable upload creation failed (413)');
    });
    const big = new File(['x'], 'inyogo.zip');
    Object.defineProperty(big, 'size', { value: 210 * 1024 * 1024 });
    render(
      <SourceRebindPanel
        brandId="44444444-4444-4444-8444-444444444444"
        assetId="11111111-1111-4111-8111-111111111111"
        expectedVersionId="22222222-2222-4222-8222-222222222222"
        onConfirmed={async () => undefined}
        initialFile={big}
      />,
    );
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toBe(
      'inyogo.zip is 210 MB, over the 50 MB upload limit, so it was not uploaded. Ask an admin to raise the limit.',
    );
  });
});
