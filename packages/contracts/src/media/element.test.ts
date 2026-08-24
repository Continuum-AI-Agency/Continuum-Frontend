import { describe, expect, it } from 'bun:test';
import {
  buildElementReferenceLabel,
  buildElementReferencePrompt,
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  ELEMENT_PERSON_FALLBACK_LIMIT,
  ELEMENT_REFERENCE_TAG,
  type ElementCategory,
  elementExternalKey,
  elementReferenceAspectRatio,
  elementSlug,
  isElementPersonCategory,
  resolveElementRefs,
} from './element';
import { HIDDEN_LIBRARY_TAGS } from './library-browse';

const members = (count: number) =>
  Array.from({ length: count }, (_unused, index) => ({
    assetId: `0000000${index}-0000-4000-8000-000000000000`,
    position: index,
  }));

describe('buildElementReferencePrompt', () => {
  it('covers all nine categories with a non-empty prompt and an explicit aspect ratio', () => {
    // The aspect ratio is the assertion that matters: if it is ever omitted, Gemini
    // inherits the ratio of the LAST input image and whichever member happens to sit
    // last silently decides the output shape.
    expect(ELEMENT_CATEGORIES).toHaveLength(9);
    for (const category of ELEMENT_CATEGORIES) {
      const built = buildElementReferencePrompt(category, 3);
      expect(built.prompt.length).toBeGreaterThan(200);
      expect(built.aspectRatio).toMatch(/^\d+:\d+$/);
      expect(built.aspectRatio).toBe(elementReferenceAspectRatio(category));
      expect(built.negativePrompt).toContain('collage');
      expect(built.negativePrompt).toContain('duplicated subject');
    }
  });

  it('uses the researched aspect ratio per category', () => {
    expect(elementReferenceAspectRatio('model')).toBe('4:5');
    expect(elementReferenceAspectRatio('character')).toBe('4:5');
    expect(elementReferenceAspectRatio('setting')).toBe('16:9');
    expect(elementReferenceAspectRatio('product')).toBe('1:1');
    expect(elementReferenceAspectRatio('moodboard')).toBe('1:1');
  });

  it('opens with one manifest line per member', () => {
    const built = buildElementReferencePrompt('product', 3);
    const lines = built.prompt.split('\n');
    expect(lines[0]).toBe('- Image 1: source photograph of the product.');
    expect(lines[1]).toBe('- Image 2: source photograph of the product.');
    expect(lines[2]).toBe('- Image 3: source photograph of the product.');
    expect(built.prompt.match(/^- Image \d+:/gm)).toHaveLength(3);
  });

  it('states the member count in the body', () => {
    expect(buildElementReferencePrompt('model', 5).prompt).toContain('The 5 attached photographs');
    expect(buildElementReferencePrompt('model', 2).prompt).toContain('The 2 attached photographs');
  });

  it('always closes with the single-output clause', () => {
    for (const category of ELEMENT_CATEGORIES) {
      expect(buildElementReferencePrompt(category, 2).prompt).toContain(
        'Produce exactly one image — not a composite, not a set, not a copy of any attached photograph.',
      );
    }
  });

  it('omits the guidance block entirely when guidelines are empty', () => {
    // An empty section is a question the model has to answer.
    for (const empty of [undefined, null, '', '   ']) {
      const built = buildElementReferencePrompt('product', 2, empty);
      expect(built.prompt).not.toContain('Operator guidance');
    }
  });

  it('puts operator guidance LAST when present', () => {
    const built = buildElementReferencePrompt('product', 2, '  the matte finish, not the glossy  ');
    expect(built.prompt.endsWith('the matte finish, not the glossy')).toBe(true);
    expect(built.prompt).toContain('Operator guidance (highest priority): the matte finish');
  });

  it('keeps the person categories on person-shaped instructions', () => {
    expect(buildElementReferencePrompt('model', 3).prompt).toContain(
      'free to change and\nshould: clothing',
    );
    // A character IS its wardrobe — the one deliberate divergence from `model`.
    expect(buildElementReferencePrompt('character', 3).prompt).toContain('and the costume');
  });

  it('handles a single member without breaking the manifest', () => {
    const built = buildElementReferencePrompt('general', 1);
    expect(built.prompt.match(/^- Image \d+:/gm)).toHaveLength(1);
    expect(built.prompt).toContain('The 1 attached images');
  });
});

describe('resolveElementRefs', () => {
  it('emits exactly one ref when a default reference exists', () => {
    const refs = resolveElementRefs({
      category: 'product',
      members: members(8),
      defaultReferenceAssetId: 'aaaaaaaa-0000-4000-8000-000000000000',
    });
    expect(refs).toEqual([{ asset_id: 'aaaaaaaa-0000-4000-8000-000000000000' }]);
  });

  it('falls back to every member, in position order, when there is no default', () => {
    const shuffled = [members(3)[2], members(3)[0], members(3)[1]];
    const refs = resolveElementRefs({
      category: 'product',
      members: shuffled,
      defaultReferenceAssetId: null,
    });
    expect(refs.map((ref) => ref.asset_id)).toEqual(members(3).map((member) => member.assetId));
  });

  it('caps person fallback at the provider character-slot ceiling', () => {
    // gemini-3.1-flash-image carries FOUR character slots, not ten.
    for (const category of ['model', 'character'] as ElementCategory[]) {
      const refs = resolveElementRefs({
        category,
        members: members(8),
        defaultReferenceAssetId: null,
      });
      expect(refs).toHaveLength(ELEMENT_PERSON_FALLBACK_LIMIT);
      expect(isElementPersonCategory(category)).toBe(true);
    }
  });

  it('caps non-person fallback at the member limit', () => {
    const refs = resolveElementRefs({
      category: 'product',
      members: members(8),
      defaultReferenceAssetId: null,
    });
    expect(refs).toHaveLength(ELEMENT_MEMBER_LIMIT);
    expect(isElementPersonCategory('product')).toBe(false);
  });

  it('emits nothing for an Element with no members and no reference', () => {
    // A missing Element is not an empty one: a node must emit NOTHING rather than
    // silently generating something plausible from zero references.
    expect(
      resolveElementRefs({ category: 'general', members: [], defaultReferenceAssetId: null }),
    ).toEqual([]);
  });
});

describe('buildElementReferenceLabel', () => {
  it('names the slot, the category and the element, and forbids improvement', () => {
    expect(buildElementReferenceLabel({ category: 'product', name: 'Hero Bottle', slot: 2 })).toBe(
      'Reference image #2 is the product reference for "Hero Bottle". ' +
        'Preserve it exactly; do not redraw, restyle or improve it.',
    );
  });
});

describe('elementSlug', () => {
  it('kebabs a name', () => {
    expect(elementSlug('Hero Bottle 500ml')).toBe('hero-bottle-500ml');
    expect(elementSlug('  Ana — Brand Model!  ')).toBe('ana-brand-model');
  });

  it('never returns an empty key', () => {
    expect(elementSlug('!!!')).toBe('element');
    expect(elementSlug('')).toBe('element');
  });

  it('builds the external key in the house convention', () => {
    expect(elementExternalKey(elementSlug('Hero Bottle'))).toBe('element:hero-bottle');
  });
});

describe('hidden library tags', () => {
  it('hides element references from default browse alongside carousel slides', () => {
    expect(HIDDEN_LIBRARY_TAGS).toContain(ELEMENT_REFERENCE_TAG);
    expect(HIDDEN_LIBRARY_TAGS).toContain('carousel-slide');
  });
});
