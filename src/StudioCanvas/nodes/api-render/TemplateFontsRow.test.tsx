import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { TemplateFontsRow } from './TemplateFontsRow';

afterEach(cleanup);

describe('TemplateFontsRow', () => {
  test('sends missing-face uploads to the Library typography surface', () => {
    render(
      <TemplateFontsRow
        brandId="22222222-2222-4222-8222-222222222222"
        assetId="55555555-5555-4555-8555-555555555555"
        fonts={[{ family: 'Heading Now', layers: 2, held: false }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Upload them' }).getAttribute('href')).toBe(
      '/library?section=typography',
    );
  });
});
