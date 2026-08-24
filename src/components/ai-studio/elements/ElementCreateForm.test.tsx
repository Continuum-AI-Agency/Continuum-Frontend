import { afterEach, describe, expect, it, mock } from 'bun:test';
import { configure, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';

// The real Select is a Base UI popup; a native select drives the same
// `onValueChange` and lets the test change category without a portal dance.
mock.module('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      aria-label="Category"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

import { ELEMENT_MEMBER_LIMIT } from '@/lib/ai-studio/elements';
import { ElementCreateForm } from './ElementCreateForm';

// A signed-preview round trip through react-query does not settle inside
// testing-library's 1s default on a loaded machine.
configure({ asyncUtilTimeout: 4000 });

const pngFile = (name: string) => new File(['x'], name, { type: 'image/png' });

const uploader = (prefix = 'asset') => {
  let count = 0;
  return mock((_params: { file: File; brandId: string }) => {
    count += 1;
    return Promise.resolve({
      assetId: `${prefix}-${count}`,
      versionId: `version-${count}`,
      signedUrl: `https://storage/${prefix}-${count}.png`,
    });
  });
};

const renderForm = (overrides: Partial<React.ComponentProps<typeof ElementCreateForm>> = {}) => {
  const onSubmit = overrides.onSubmit ?? mock(() => {});
  const props = {
    brandId: 'brand-1',
    onCancel: mock(() => {}),
    onSubmit,
    uploadAsset: uploader(),
    ...overrides,
  };
  render(<ElementCreateForm {...props} />);
  return { ...props, onSubmit };
};

const addImages = async (names: string[]) => {
  const input = document.getElementById('element-images') as HTMLInputElement;
  fireEvent.change(input, { target: { files: names.map(pngFile) } });
  await waitFor(() => {
    expect(screen.getByText(new RegExp(`^${names.length}/${ELEMENT_MEMBER_LIMIT}$`))).toBeTruthy();
  });
};

describe('ElementCreateForm', () => {
  afterEach(() => {
    cleanup();
  });

  it('uploads picked images through the library seam and stages them as members', async () => {
    const uploadAsset = uploader();
    renderForm({ uploadAsset });

    await addImages(['a.png', 'b.png']);

    expect(uploadAsset).toHaveBeenCalledTimes(2);
    expect(uploadAsset.mock.calls[0]?.[0]?.brandId).toBe('brand-1');
    expect(screen.getByAltText('a.png').getAttribute('src')).toBe('https://storage/asset-1.png');
  });

  it('refuses more than eight images and says how many it left out', async () => {
    renderForm();

    const input = document.getElementById('element-images') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: Array.from({ length: 10 }, (_, index) => pngFile(`img-${index}.png`)) },
    });

    await waitFor(() => {
      expect(screen.getByText(`${ELEMENT_MEMBER_LIMIT}/${ELEMENT_MEMBER_LIMIT}`)).toBeTruthy();
    });
    expect(
      screen.getByText(
        `An Element holds at most ${ELEMENT_MEMBER_LIMIT} images — 2 not added.`,
      ),
    ).toBeTruthy();
  });

  it('cannot be submitted with no images', () => {
    renderForm();

    expect(
      (screen.getByRole('button', { name: 'Create Element' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('refuses to save a person Element without a rights basis', async () => {
    const onSubmit = mock(() => {});
    renderForm({ onSubmit });

    await addImages(['face.png']);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'model' } });

    await waitFor(() => {
      expect(
        screen.getByText('A Model Element needs a rights basis before it can be saved.'),
      ).toBeTruthy();
    });
    const submit = screen.getByRole('button', { name: 'Create Element' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a person Element once the rights basis is filled in', async () => {
    const onSubmit = mock(() => {});
    renderForm({ onSubmit });

    await addImages(['face.png']);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'model' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Aria' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Rights basis')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Rights basis'), {
      target: { value: 'own employee, consent on file' },
    });
    fireEvent.change(screen.getByLabelText('Guidelines'), {
      target: { value: 'she wears glasses' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Element' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Aria',
      category: 'model',
      memberAssetIds: ['asset-1'],
      guidelines: 'she wears glasses',
      rightsNote: 'own employee, consent on file',
    });
  });

  it('never asks a product Element for a rights basis', async () => {
    renderForm();

    await addImages(['bottle.png']);

    expect(screen.queryByLabelText('Rights basis')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Create Element' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('tells a style Element to vary the subject rather than the treatment', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'style' } });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Use images of different things in the same style — that’s how we tell the style apart from the subject.',
        ),
      ).toBeTruthy();
    });
  });
});
