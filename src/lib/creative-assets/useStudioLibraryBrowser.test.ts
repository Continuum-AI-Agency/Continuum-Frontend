import { describe, expect, test } from 'bun:test';
import { buildStudioLibraryBrowseParams } from './useStudioLibraryBrowser';

const brandId = '11111111-1111-4111-8111-111111111111';

describe('Studio library browse destinations', () => {
  test('Home lists via browse RPC with updated_desc, not the legacy assets dump', () => {
    const params = buildStudioLibraryBrowseParams(
      brandId,
      { source: 'all', kind: 'all', destination: 'home' },
      null,
    );
    expect(params?.get('destination')).toBe('home');
    expect(params?.get('sort')).toBe('updated_desc');
    expect(params?.get('mediaType')).toBeNull();
  });

  test('Canvas pins createdWith=canvas', () => {
    const params = buildStudioLibraryBrowseParams(
      brandId,
      { source: 'all', kind: 'all', destination: 'canvas' },
      null,
    );
    expect(params?.get('destination')).toBe('canvas');
    expect(params?.get('createdWith')).toBe('canvas');
  });

  test('Sources asks for project files', () => {
    const params = buildStudioLibraryBrowseParams(
      brandId,
      { source: 'all', kind: 'all', destination: 'sources' },
      null,
    );
    expect(params?.get('destination')).toBe('sources');
    expect(params?.get('mediaType')).toBe('project_file');
  });

  test('Elements is not an asset list', () => {
    expect(
      buildStudioLibraryBrowseParams(
        brandId,
        { source: 'all', kind: 'all', destination: 'elements' },
        null,
      ),
    ).toBeNull();
  });
});
