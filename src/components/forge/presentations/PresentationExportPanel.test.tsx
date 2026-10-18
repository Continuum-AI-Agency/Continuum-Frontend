import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const preview = mock(async () => ({
  confirmationToken: 'token',
  revision: 3,
  formats: ['pptx', 'pdf'],
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
}));
const confirm = mock(async () => ({
  outputs: [
    {
      assetId: 'asset-a',
      versionId: 'version-a',
      fileName: 'Deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      url: 'https://files.example/Deck.pptx',
    },
  ],
}));
mock.module('@/lib/api/presentations.client', () => ({
  presentationsApi: { previewExport: preview, confirmExport: confirm },
}));

import { PresentationExportPanel } from './PresentationExportPanel';

afterEach(() => {
  cleanup();
  preview.mockClear();
  confirm.mockClear();
});
const props = {
  scope: { brandId: 'brand-a', assetId: 'asset-a', baseVersionId: 'version-a' },
  revision: 3,
  title: 'Deck',
  dirty: false,
  blocked: false,
  save: async () => true,
  onError: (_message: string) => undefined,
};

describe('PresentationExportPanel', () => {
  test('creating an export preview does not export until explicitly confirmed', async () => {
    render(<PresentationExportPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review export' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm export to Files' })).toBeTruthy(),
    );
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm export to Files' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Deck.pptx' })).toBeTruthy());
    expect(confirm).toHaveBeenCalledWith(props.scope, 'token');
  });
  test('editing the deck invalidates the prior approval', async () => {
    const view = render(<PresentationExportPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review export' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm export to Files' })).toBeTruthy(),
    );
    view.rerender(<PresentationExportPanel {...props} dirty />);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Confirm export to Files' })).toBeNull(),
    );
    expect(confirm).not.toHaveBeenCalled();
  });
  test('blocking diagnostics prevent preparation and export', () => {
    render(<PresentationExportPanel {...props} blocked />);
    expect(
      (screen.getByRole('button', { name: 'Review export' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(preview).not.toHaveBeenCalled();
  });
});
