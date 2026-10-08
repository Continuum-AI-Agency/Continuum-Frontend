import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { FORGE_PROJECT_FILE_MAX_MB } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { unzipSync, zipSync } from 'fflate';

const preview = mock(async () => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  expectedVersionId: '22222222-2222-4222-8222-222222222222',
  versionId: '33333333-3333-4333-8333-333333333333',
  checksum: 'a'.repeat(64),
  requiresReview: true,
  slots: [{ slotKey: 'headline', name: 'Headline', kind: 'text', status: 'missing' as const }],
}));
const confirm = mock(async () => preview());
const uploadNewAssetVersion = mock(async (_input: { file: File; baseVersionId?: string }) => ({
  versionId: '33333333-3333-4333-8333-333333333333',
}));
let sourceFileName = 'campaign-v1.aep';
let sourceSignedUrl: string | null = null;

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
      fileName: sourceFileName,
      signedUrl: sourceSignedUrl,
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
  sourceFileName = 'campaign-v1.aep';
  sourceSignedUrl = null;
});
afterEach(cleanup);

describe('SourceRebindPanel', () => {
  test('offers direct review of a saved Library head that is not active in the template', async () => {
    render(
      <SourceRebindPanel
        brandId="44444444-4444-4444-8444-444444444444"
        assetId="11111111-1111-4111-8111-111111111111"
        expectedVersionId="22222222-2222-4222-8222-222222222222"
        onConfirmed={async () => undefined}
      />,
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      'saved but this template still uses',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review newer version' }));
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith(
        expect.objectContaining({
          versionId: '33333333-3333-4333-8333-333333333333',
        }),
      ),
    );
  });

  test('a media row drop repairs and rebinds the same template source', async () => {
    sourceFileName = 'campaign.zip';
    sourceSignedUrl = 'https://signed.test/campaign.zip';
    const original = zipSync({ 'campaign.aep': new Uint8Array([1]) });
    const savedFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(original)) as typeof fetch;
    preview.mockImplementationOnce(async () => ({
      assetId: '11111111-1111-4111-8111-111111111111',
      expectedVersionId: '22222222-2222-4222-8222-222222222222',
      versionId: '33333333-3333-4333-8333-333333333333',
      checksum: 'a'.repeat(64),
      requiresReview: false,
      slots: [],
      missingFootage: [],
    }));
    const refreshed = mock(async () => undefined);
    try {
      const view = render(
        <SourceRebindPanel
          repairOnly
          brandId="44444444-4444-4444-8444-444444444444"
          assetId="11111111-1111-4111-8111-111111111111"
          expectedVersionId="22222222-2222-4222-8222-222222222222"
          aepName="campaign.aep"
          missingFootage={[{ name: 'Logo', file: 'C:\\work\\(Footage)\\logo.png' }]}
          onConfirmed={refreshed}
        />,
      );
      const input = view.container.querySelector<HTMLInputElement>('input[id^="repair-media-"]');
      expect(input).not.toBeNull();
      fireEvent.change(input!, { target: { files: [new File(['logo'], 'logo.png')] } });
      await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
      const uploaded = uploadNewAssetVersion.mock.calls[0]?.[0].file;
      expect(uploaded).toBeDefined();
      const repaired = unzipSync(new Uint8Array(await uploaded!.arrayBuffer()));
      expect(repaired['(Footage)/logo.png']).toEqual(new TextEncoder().encode('logo'));
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ acceptMissing: false }));
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
  test('a preview-side drop opens source review when the saved repair changes slots', async () => {
    sourceFileName = 'campaign.zip';
    sourceSignedUrl = 'https://signed.test/campaign.zip';
    const original = zipSync({ 'campaign.aep': new Uint8Array([1]) });
    const savedFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(original)) as typeof fetch;
    const onNeedsReview = mock((_versionId: string) => undefined);
    try {
      const view = render(
        <SourceRebindPanel
          repairOnly
          brandId="44444444-4444-4444-8444-444444444444"
          assetId="11111111-1111-4111-8111-111111111111"
          expectedVersionId="22222222-2222-4222-8222-222222222222"
          aepName="campaign.aep"
          missingFootage={[{ name: 'Logo', file: 'C:\\work\\(Footage)\\logo.png' }]}
          onNeedsReview={onNeedsReview}
          onConfirmed={async () => undefined}
        />,
      );
      const input = view.container.querySelector<HTMLInputElement>('input[id^="repair-media-"]');
      fireEvent.change(input!, { target: { files: [new File(['logo'], 'logo.png')] } });
      await waitFor(() =>
        expect(onNeedsReview).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333'),
      );
      expect(confirm).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
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
    // The template is bound to v1 but the Library head is v2: the revision builds on the head.
    expect(uploadNewAssetVersion.mock.calls[0]?.[0].baseVersionId).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
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
      `inyogo.zip is 210 MB, over the ${FORGE_PROJECT_FILE_MAX_MB} MB upload limit, so it was not uploaded. Ask an admin to raise the limit.`,
    );
  });
});

test('a batch of AI and PSD files repairs a raw AEP in one reviewed source version', async () => {
  sourceFileName = 'campaign.aep';
  sourceSignedUrl = 'https://signed.test/campaign.aep';
  const savedFetch = globalThis.fetch;
  globalThis.fetch = mock(async () => new Response(new Uint8Array([1, 2]))) as typeof fetch;
  preview.mockImplementationOnce(async () => ({
    assetId: '11111111-1111-4111-8111-111111111111',
    expectedVersionId: '22222222-2222-4222-8222-222222222222',
    versionId: '33333333-3333-4333-8333-333333333333',
    checksum: 'a'.repeat(64),
    requiresReview: false,
    slots: [],
    missingFootage: [],
  }));
  const refreshed = mock(async () => undefined);
  try {
    render(
      <SourceRebindPanel
        repairOnly
        brandId="44444444-4444-4444-8444-444444444444"
        assetId="11111111-1111-4111-8111-111111111111"
        expectedVersionId="22222222-2222-4222-8222-222222222222"
        aepName="campaign.aep"
        missingFootage={[
          { name: 'Logo', file: '/old/logo.ai' },
          { name: 'Photo', file: '/old/photo.psd' },
        ]}
        onConfirmed={refreshed}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose missing files'), {
      target: {
        files: [
          new File(['ai'], 'logo.ai'),
          new File(['psd'], 'photo.psd'),
          new File(['other'], 'unused.ai'),
        ],
      },
    });
    expect(screen.getByText(/Unmatched files/).textContent).toContain('unused.ai');
    fireEvent.click(screen.getByRole('button', { name: 'Repair 2 matched files' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    expect(uploadNewAssetVersion).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    const file = uploadNewAssetVersion.mock.calls[0]![0].file;
    expect(file.name).toBe('campaign.zip');
    const content = unzipSync(new Uint8Array(await file.arrayBuffer()));
    expect(content['campaign.aep']).toEqual(new Uint8Array([1, 2]));
    expect(new TextDecoder().decode(content['logo.ai'])).toBe('ai');
    expect(new TextDecoder().decode(content['photo.psd'])).toBe('psd');
  } finally {
    globalThis.fetch = savedFetch;
  }
});
