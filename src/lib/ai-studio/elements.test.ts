import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({} as unknown));

mock.module('@/lib/api/http', () => ({
  http: { http: undefined, request: requestMock },
}));

import type { ElementRecord } from '@continuum/contracts';
import {
  createElement,
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  ELEMENT_PERSON_FALLBACK_LIMIT,
  type ElementCategory,
  elementDefaultReferenceAssetId,
  elementNodeEmission,
  elementReferenceTypeFor,
  elementReferenceTypeForUse,
  elementRequiresRightsNote,
  elementSourceAssetId,
  generateElementReference,
  listElements,
  setElementDefaultReference,
  signLibraryAsset,
  updateElement,
} from './elements';

const buildElement = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  name: 'Aria',
  slug: 'aria',
  category: 'product',
  guidelines: null,
  rightsNote: null,
  members: [],
  referenceHistory: [],
  defaultReferenceAssetId: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

const members = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    assetId: `member-${index + 1}`,
    position: index,
  }));

describe('elements api', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('lists a brand elements and unwraps the envelope', async () => {
    requestMock.mockResolvedValueOnce({ elements: [buildElement()] } as never);

    const result = await listElements('brand-1');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/media/elements?brandId=brand-1' }),
    );
    expect(result).toHaveLength(1);
  });

  it('creates an element from library asset ids', async () => {
    requestMock.mockResolvedValueOnce({ element: buildElement() } as never);

    await createElement({
      brandId: 'brand-1',
      name: 'Aria',
      category: 'model',
      memberAssetIds: ['asset-1'],
      rightsNote: 'own employee, consent on file',
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/media/elements',
        method: 'POST',
        body: expect.objectContaining({
          category: 'model',
          memberAssetIds: ['asset-1'],
          rightsNote: 'own employee, consent on file',
        }),
      }),
    );
  });

  it('patches an element in place, carrying the brand fence', async () => {
    requestMock.mockResolvedValueOnce({ element: buildElement() } as never);

    await updateElement('element-1', { brandId: 'brand-1', guidelines: 'the matte finish' });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/media/elements/element-1',
        method: 'PATCH',
        body: { brandId: 'brand-1', guidelines: 'the matte finish' },
      }),
    );
  });

  it('regenerates the reference from the members, not from the previous reference', async () => {
    requestMock.mockResolvedValueOnce({
      element: buildElement(),
      referenceAssetId: 'ref-1',
      becameDefault: false,
    } as never);

    const result = await generateElementReference('element-1', 'brand-1');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/media/elements/element-1/reference',
        method: 'POST',
        // Nothing but the brand fence: the Backend re-derives from the stored members,
        // so anything the FE sent here would be a second, drifting source of truth.
        body: { brandId: 'brand-1' },
      }),
    );
    expect(result.becameDefault).toBe(false);
  });

  it('pins a reference as the default with PUT', async () => {
    requestMock.mockResolvedValueOnce({ element: buildElement() } as never);

    await setElementDefaultReference('element-1', 'brand-1', 'asset-2', 'updated-1');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/media/elements/element-1/default-reference',
        method: 'PUT',
        body: { brandId: 'brand-1', assetId: 'asset-2', expectedUpdatedAt: 'updated-1' },
      }),
    );
  });

  it('clears the default through the same endpoint', async () => {
    requestMock.mockResolvedValueOnce({ element: buildElement() } as never);

    await setElementDefaultReference('element-1', 'brand-1', null, 'updated-1');

    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      body: { brandId: 'brand-1', assetId: null, expectedUpdatedAt: 'updated-1' },
    });
  });
});

describe('signLibraryAsset', () => {
  it('mints a signed url for one asset', async () => {
    const fetchMock = mock(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ signedUrl: 'https://s/1.png' }) }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as never;

    try {
      expect(await signLibraryAsset('brand-1', 'asset-1')).toBe('https://s/1.png');
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/library/sign');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws rather than returning a blank src when signing fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.resolve({ ok: false, status: 404 })) as never;

    try {
      await expect(signLibraryAsset('brand-1', 'asset-1')).rejects.toThrow('404');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('element category rules', () => {
  it('maps every category to a reference type the canvas already understands', () => {
    const expected: Record<ElementCategory, string> = {
      model: 'person',
      character: 'person',
      product: 'product',
      object: 'product',
      material: 'default',
      setting: 'default',
      location: 'default',
      landscape: 'default',
      style: 'default',
      moodboard: 'default',
      palette: 'color',
      animation: 'default',
      effect: 'default',
      general: 'default',
    };
    for (const category of ELEMENT_CATEGORIES) {
      expect(elementReferenceTypeFor(category)).toBe(expected[category] as never);
    }
  });

  it('lets each placement choose how the same sheet is interpreted', () => {
    expect(elementReferenceTypeForUse('product', 'subject')).toBe('product');
    expect(elementReferenceTypeForUse('product', 'environment')).toBe('default');
    expect(elementReferenceTypeForUse('product', 'palette')).toBe('color');
  });

  it('requires a rights basis for the person categories only', () => {
    expect(elementRequiresRightsNote('model')).toBe(true);
    expect(elementRequiresRightsNote('character')).toBe(true);
    expect(elementRequiresRightsNote('product')).toBe(false);
    expect(elementRequiresRightsNote('style')).toBe(false);
  });

  it('caps person fallback at the model four character slots', () => {
    expect(
      elementNodeEmission(buildElement({ category: 'model', members: members(8) }))?.refs,
    ).toHaveLength(ELEMENT_PERSON_FALLBACK_LIMIT);
    expect(
      elementNodeEmission(buildElement({ category: 'product', members: members(8) }))?.refs,
    ).toHaveLength(ELEMENT_MEMBER_LIMIT);
  });
});

describe('elementSourceAssetId', () => {
  it('resolves the current approved sheet, never an unapproved candidate', () => {
    const element = buildElement({
      members: members(1),
      referenceHistory: ['candidate'],
      defaultReferenceAssetId: null,
    });
    expect(elementSourceAssetId(element, 'subject')).toBe('member-1');
    expect(
      elementSourceAssetId({ ...element, defaultReferenceAssetId: 'approved' }, 'subject'),
    ).toBe('approved');
  });

  it('resolves the canonical clip for a motion placement', () => {
    expect(elementSourceAssetId(buildElement({ motionAssetId: 'clip-1' }), 'motion')).toBe(
      'clip-1',
    );
  });
});

describe('elementNodeEmission', () => {
  it('emits the pinned reference as a single ref', () => {
    const element = buildElement({
      members: members(5),
      referenceHistory: ['ref-1', 'ref-2'],
      defaultReferenceAssetId: 'ref-2',
    });

    const emission = elementNodeEmission(element);

    expect(emission?.mode).toBe('pinned');
    expect(emission?.refs).toEqual([{ asset_id: 'ref-2' }]);
    expect(emission?.droppedCount).toBe(0);
  });

  it('falls back to the raw members in position order when there is no reference', () => {
    const element = buildElement({
      members: [
        { assetId: 'b', position: 1 },
        { assetId: 'a', position: 0 },
      ],
    });

    const emission = elementNodeEmission(element);

    expect(emission?.mode).toBe('fallback');
    expect(emission?.refs).toEqual([{ asset_id: 'a' }, { asset_id: 'b' }]);
  });

  it('truncates a person fallback at four members and reports what was dropped', () => {
    const element = buildElement({ category: 'model', members: members(8) });

    const emission = elementNodeEmission(element);

    expect(emission?.refs).toHaveLength(ELEMENT_PERSON_FALLBACK_LIMIT);
    expect(emission?.droppedCount).toBe(4);
    expect(emission?.referenceType).toBe('person');
  });

  it('lets a non-person fallback carry all eight members', () => {
    const element = buildElement({ category: 'product', members: members(8) });

    const emission = elementNodeEmission(element);

    expect(emission?.refs).toHaveLength(8);
    expect(emission?.droppedCount).toBe(0);
  });

  it('emits nothing for a missing element', () => {
    expect(elementNodeEmission(null)).toBeNull();
    expect(elementNodeEmission(undefined)).toBeNull();
  });

  it('emits nothing for an element with neither a reference nor members', () => {
    expect(elementNodeEmission(buildElement())).toBeNull();
  });

  it('carries a label naming what the image is', () => {
    const element = buildElement({ name: 'Aria', category: 'model', members: members(1) });

    const emission = elementNodeEmission(element, 3);

    expect(emission?.label).toBe(
      'Reference image #3 is the model reference for "Aria". Preserve it exactly; do not redraw, restyle or improve it.',
    );
    expect(elementNodeEmission(element, 1)?.label).toContain('Reference image #1');
  });
});

describe('elementDefaultReferenceAssetId', () => {
  it('prefers the pinned reference', () => {
    const element = buildElement({
      referenceHistory: ['ref-1', 'ref-2'],
      defaultReferenceAssetId: 'ref-1',
    });

    expect(elementDefaultReferenceAssetId(element)).toBe('ref-1');
  });

  it('falls back to the newest reference when nothing is pinned', () => {
    const element = buildElement({ referenceHistory: ['ref-1', 'ref-2'] });

    expect(elementDefaultReferenceAssetId(element)).toBe('ref-2');
  });
});
