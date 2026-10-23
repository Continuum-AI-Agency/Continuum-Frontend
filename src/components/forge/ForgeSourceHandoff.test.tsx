import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// The agent's upload link: a template project rides the same handoff as a brief's documents and
// media, uploaded the way the gallery uploads it, and comes back to the agent as a `template` ref.

const order: string[] = [];
const invoke = mock(async (_name: string, options: { body: Record<string, unknown> }) =>
  options.body.action === 'get_forge_source_intent'
    ? { data: { status: 'awaiting_upload' }, error: null }
    : { data: { status: 'completed' }, error: null },
);
const uploadMediaAsset = mock(async ({ file }: { file: File }) => {
  order.push(`upload ${file.name}`);
  return { assetId: `${file.name}-asset`, versionId: `${file.name}-version` };
});
const uploadTemplateFontFiles = mock(async (_brandId: string, files: File[]) => {
  order.push(`fonts ${files.map((file) => file.name).join(',')}`);
  return { stored: files.map((file) => file.name), refused: [] };
});
const importDesignTemplate = mock(async () => ({
  assetId: 'authored-asset',
  parseState: 'pending',
  status: 'created' as const,
}));
const fetchTemplateSources = mock(async () => [{ assetId: 'authored-asset', versionId: 'authored-version' }]);

mock.module('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('mcpSourceIntent=intent-1'),
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke } }),
}));
const media = { ...(await import('@/lib/library/uploadMediaAsset')) };
mock.module('@/lib/library/uploadMediaAsset', () => ({ ...media, uploadMediaAsset }));
const sources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  uploadTemplateFontFiles,
  importDesignTemplate,
  fetchTemplateSources,
}));
const { ForgeSourceHandoff } = await import('./ForgeSourceHandoff');

afterEach(() => {
  cleanup();
  order.length = 0;
  for (const fn of [invoke, uploadMediaAsset, uploadTemplateFontFiles, importDesignTemplate, fetchTemplateSources])
    fn.mockClear();
});

const file = (name: string) => new File(['x'], name);

async function choose(files: File[]) {
  render(<ForgeSourceHandoff brandId="brand-1" />);
  const input = await screen.findByLabelText('Choose Forge source files');
  fireEvent.change(input, { target: { files } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
}

test('an After Effects project and a Photoshop design reach the agent as template refs, fonts first', async () => {
  await choose([file('promo.aep'), file('Brand.ttf'), file('poster.psd')]);
  await screen.findByText('Sources uploaded. The agent can continue with this handoff.');

  expect(order).toEqual(['fonts Brand.ttf', 'upload promo.aep', 'upload poster.psd']);
  // The PSD becomes its own authored package, and that package is what the agent publishes.
  expect(importDesignTemplate.mock.calls).toEqual([['brand-1', 'poster.psd-asset']]);
  const completion = invoke.mock.calls.find(([, options]) => options.body.action === 'complete_forge_source_intent');
  expect(completion?.[1].body).toEqual({
    action: 'complete_forge_source_intent',
    brandId: 'brand-1',
    uploadIntentId: 'intent-1',
    sourceRefs: [
      { kind: 'template', asset_id: 'promo.aep-asset', version_id: 'promo.aep-version' },
      { kind: 'template', asset_id: 'authored-asset', version_id: 'authored-version' },
    ],
  });
});

test('a fourth template project is refused before the handoff completes', async () => {
  await choose(['a', 'b', 'c', 'd'].map((name) => file(`${name}.aep`)));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Use at most three template projects.'));
  expect(invoke.mock.calls.some(([, options]) => options.body.action === 'complete_forge_source_intent')).toBe(false);
});
