import { afterEach, describe, expect, mock, test } from 'bun:test';

const uploadBrandFont = mock(async () => ({ family: 'Heading Now', format: 'otf', bytes: 4 }));
mock.module('@/lib/library/templateSources', () => ({ uploadBrandFont }));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FontUploadReviewDialog } from './FontUploadReviewDialog';

afterEach(() => {
  cleanup();
  uploadBrandFont.mockClear();
});

describe('FontUploadReviewDialog', () => {
  test('requires metadata review before storing a font', async () => {
    const file = new File([new Uint8Array([79, 84, 84, 79])], 'HeadingNow-Bold.otf', {
      type: 'font/otf',
    });
    const onUploaded = mock(() => undefined);
    render(
      <FontUploadReviewDialog
        brandId="22222222-2222-4222-8222-222222222222"
        files={[file]}
        onClose={() => undefined}
        onUploaded={onUploaded}
      />,
    );

    expect(uploadBrandFont).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Font family'), { target: { value: 'Heading Now' } });
    fireEvent.change(screen.getByLabelText('Weight (optional)'), { target: { value: '700' } });
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'italic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to engine' }));

    expect(await screen.findByText(/added to the engine/i)).toBeTruthy();
    expect(uploadBrandFont).toHaveBeenCalledWith({
      brandId: '22222222-2222-4222-8222-222222222222',
      family: 'Heading Now',
      file,
      weight: 700,
      style: 'italic',
    });
    expect(onUploaded).toHaveBeenCalled();
  });

  test('announces validation errors and cannot be dismissed while an upload is running', async () => {
    let finish: (() => void) | undefined;
    uploadBrandFont.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ family: 'Heading Now', format: 'otf', bytes: 4 });
        }),
    );
    const onClose = mock(() => undefined);
    const file = new File([new Uint8Array([79, 84, 84, 79])], 'Heading.otf', {
      type: 'font/otf',
    });
    render(
      <FontUploadReviewDialog
        brandId="22222222-2222-4222-8222-222222222222"
        files={[file]}
        onClose={onClose}
        onUploaded={() => undefined}
      />,
    );

    const family = screen.getByLabelText('Font family');
    fireEvent.change(family, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to engine' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Family is required');
    expect(family.getAttribute('aria-invalid')).toBe('true');
    expect(family.getAttribute('aria-describedby')).toBe('font-family-error-0');

    fireEvent.change(family, { target: { value: 'Heading Now' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to engine' }));
    expect(
      ((await screen.findByRole('button', { name: 'Add to engine' })) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    finish?.();
    expect(await screen.findByText(/added to the engine/i)).toBeTruthy();
  });
});
