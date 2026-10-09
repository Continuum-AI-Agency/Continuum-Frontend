/**
 * TemplateColourFields — marking a render field as a colour from the Layers tab. A detected colour
 * is locked on, marking saves the whole set and refetches the contract, and unmarking sends the
 * set without that key.
 */

import { afterEach, expect, mock, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const BRAND = '33333333-3333-4333-8333-333333333333';
const ASSET = '11111111-1111-4111-8111-111111111111';

let variables: Array<{ key: string; label: string; kind: string }> = [];
let stored: string[] = [];
const getContract = mock(async () => ({ variables }));
const fetchTemplateColourFields = mock(async () => ({ templateKey: '184', keys: stored }));
const saveTemplateColourFields = mock(
  async (_brandId: string, _assetId: string, fields: { templateKey: string; keys: string[] }) => {
    stored = fields.keys;
    variables = variables.map((v) =>
      fields.keys.includes(v.key)
        ? { ...v, kind: 'color' }
        : v.key === 'detected'
          ? v
          : { ...v, kind: 'text' },
    );
    return fields;
  },
);

// Spread the real modules: a PARTIAL mock.module deletes a module's other exports for every file
// that loads afterwards, in this whole process.
const api = await import('@/StudioCanvas/nodes/api-render/apiRendersApi');
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  ...api,
  apiRendersApi: { ...api.apiRendersApi, getContract },
}));
const sources = await import('@/lib/library/templateSources');
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  fetchTemplateColourFields,
  saveTemplateColourFields,
}));

const { TemplateColourFields } = await import('@/components/forge/TemplateColourFields');

afterEach(() => {
  cleanup();
  getContract.mockClear();
  saveTemplateColourFields.mockClear();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TemplateColourFields brandId={BRAND} assetId={ASSET} templateKey="184" />
    </QueryClientProvider>,
  );
}

const control = (label: string) => screen.findByRole('switch', { name: `${label} is a colour` });

test('a colour the template declares is shown on and cannot be switched off', async () => {
  variables = [{ key: 'detected', label: 'Box Color', kind: 'color' }];
  stored = [];
  mount();
  const box = await control('Box Color');
  expect(box.getAttribute('aria-checked')).toBe('true');
  // Base UI renders a span with aria-disabled, not a native disabled button.
  await waitFor(() => expect(box.getAttribute('aria-disabled')).toBe('true'));
  expect(screen.getByText(/detected from the template/)).toBeTruthy();
  fireEvent.click(box);
  expect(saveTemplateColourFields).toHaveBeenCalledTimes(0);
});

test('marking a text field saves the set and the refetched contract shows it as a colour', async () => {
  variables = [
    { key: 'detected', label: 'Box Color', kind: 'color' },
    { key: 'template_field_3', label: 'Template Field 3', kind: 'text' },
  ];
  stored = [];
  mount();
  const field = await control('Template Field 3');
  await waitFor(() => expect(field.getAttribute('aria-disabled')).not.toBe('true'));
  fireEvent.click(field);

  await waitFor(() => expect(saveTemplateColourFields).toHaveBeenCalledTimes(1));
  expect(saveTemplateColourFields.mock.calls[0]?.[2]).toEqual({
    templateKey: '184',
    keys: ['template_field_3'],
  });
  await waitFor(async () =>
    expect((await control('Template Field 3')).getAttribute('aria-checked')).toBe('true'),
  );
  expect(getContract.mock.calls.length).toBeGreaterThan(1);
});

test('unmarking sends the set without that field', async () => {
  variables = [
    { key: 'template_field_3', label: 'Template Field 3', kind: 'color' },
    { key: 'template_field_4', label: 'Template Field 4', kind: 'color' },
  ];
  stored = ['template_field_3', 'template_field_4'];
  mount();
  const field = await control('Template Field 3');
  await waitFor(() => expect(field.getAttribute('aria-disabled')).not.toBe('true'));
  fireEvent.click(field);

  await waitFor(() => expect(saveTemplateColourFields).toHaveBeenCalledTimes(1));
  expect(saveTemplateColourFields.mock.calls[0]?.[2]).toEqual({
    templateKey: '184',
    keys: ['template_field_4'],
  });
});

test('a template with no text or colour fields shows nothing', async () => {
  variables = [{ key: 'hero', label: 'Hero', kind: 'image' }];
  stored = [];
  mount();
  await waitFor(() => expect(getContract).toHaveBeenCalled());
  expect(screen.queryByText('Colour fields')).toBeNull();
});
