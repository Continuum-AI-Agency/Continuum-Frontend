import { describe, expect, it } from 'bun:test';
import {
  buildElementReferenceLabel,
  buildElementReferencePrompt,
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  ELEMENT_PERSON_FALLBACK_LIMIT,
  ELEMENT_REFERENCE_TAG,
  type ElementCategory,
  ELEMENT_CATALOG_ROW_LIMIT,
  elementExternalKey,
  elementOriginRefSchema,
  elementProductFactsSchema,
  elementRecordSchema,
  elementReferenceAspectRatio,
  elementSlug,
  importElementCatalogRequestSchema,
  importElementCatalogResponseSchema,
  isElementPersonCategory,
  matchCatalogRowToElement,
  partitionElementCatalog,
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

// --- Product facts -----------------------------------------------------------

const UUID = (seed: string) => `${seed}-0000-4000-8000-000000000000`;

/** An Element record shaped EXACTLY as it was before product facts existed. */
const legacyRecord = {
  id: UUID('11111111'),
  brandId: UUID('22222222'),
  name: 'Hero Bottle',
  slug: 'hero-bottle',
  category: 'product' as const,
  guidelines: null,
  rightsNote: null,
  members: members(2),
  referenceHistory: [],
  defaultReferenceAssetId: null,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
};

describe('elementProductFactsSchema', () => {
  it('leaves an Element with images and no facts exactly as valid as before', () => {
    // The whole point of OPTIONAL: every payload written before this block existed must
    // still parse, to the same object, with no `product` key invented for it.
    const parsed = elementRecordSchema.parse(legacyRecord);
    expect(parsed).toEqual(legacyRecord);
    expect('product' in parsed).toBe(false);

    const origin = elementOriginRefSchema.parse({ category: 'product' });
    expect('product' in origin).toBe(false);
  });

  it('round-trips facts through the record', () => {
    const product = {
      sku: 'HB-500',
      price: { amountMinor: 1999, currency: 'USD' },
      productUrl: 'https://example.com/hero-bottle',
      variants: [
        { name: '500ml / Matte Black', sku: 'HB-500-MB', price: { amountMinor: 1999, currency: 'USD' } },
        { name: '750ml / Steel', sku: 'HB-750-ST', price: { amountMinor: 2499, currency: 'USD' } },
      ],
    };
    const parsed = elementRecordSchema.parse({ ...legacyRecord, product });
    expect(parsed.product).toEqual(product);
    expect(elementRecordSchema.parse(parsed)).toEqual(parsed);
  });

  it('defaults variants to an empty list so a consumer never null-checks it', () => {
    expect(elementProductFactsSchema.parse({ sku: 'HB-500' }).variants).toEqual([]);
  });

  it('rejects a float price — money is minor units, never a float', () => {
    // 19.99 is not a price, it is a rounding bug waiting for a currency with no
    // sub-unit. `campaignMoneySchema` (goals/campaign-artifacts) is the money type.
    expect(
      elementProductFactsSchema.safeParse({ price: { amountMinor: 19.99, currency: 'USD' } })
        .success,
    ).toBe(false);
    expect(
      elementProductFactsSchema.safeParse({
        variants: [{ name: '500ml', price: { amountMinor: 19.99, currency: 'USD' } }],
      }).success,
    ).toBe(false);
    // ...and the currency is an ISO-4217 code, not free text.
    expect(
      elementProductFactsSchema.safeParse({ price: { amountMinor: 1999, currency: 'usd' } })
        .success,
    ).toBe(false);
    expect(
      elementProductFactsSchema.safeParse({ price: { amountMinor: 1999, currency: 'USD' } })
        .success,
    ).toBe(true);
  });

  it('does not leak product facts into the reference prompt', () => {
    // The prompt is built from category + member count + operator guidance. Adding a
    // price to an Element must not change one character of what the model is sent.
    const before = buildElementReferencePrompt('product', 3, 'the matte finish');
    expect(before.prompt).not.toContain('HB-500');
    expect(before.prompt).toContain('at least eighty-five percent of the frame');
    expect(before.prompt).toContain('Reproduce the label artwork exactly');
    expect(before.aspectRatio).toBe('1:1');
  });
});

// --- Catalog import ----------------------------------------------------------

const catalogRow = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  memberAssetIds: [UUID('aaaaaaa1'), UUID('aaaaaaa2')],
  ...extra,
});

describe('partitionElementCatalog', () => {
  it('reports the bad rows by index and still accepts the rest', () => {
    // A 200-product catalog that rejects wholesale because row 47 has a malformed price
    // is a catalog nobody can upload.
    const rows = [
      catalogRow('Hero Bottle', { product: { sku: 'HB-500' } }),
      catalogRow('Travel Mug', { product: { price: { amountMinor: 12.5, currency: 'USD' } } }),
      catalogRow('Steel Flask'),
      { name: 'No Images' },
      'not even an object',
    ];

    const { accepted, rejected } = partitionElementCatalog(rows);

    expect(accepted).toHaveLength(2);
    expect(accepted.map((entry) => entry.index)).toEqual([0, 2]);
    expect(accepted.map((entry) => entry.row.name)).toEqual(['Hero Bottle', 'Steel Flask']);

    expect(rejected).toHaveLength(3);
    expect(rejected.map((entry) => entry.index)).toEqual([1, 3, 4]);
    for (const entry of rejected) {
      expect(entry.reason).toBe('element_catalog_row_invalid');
      expect(entry.issues.length).toBeGreaterThan(0);
    }
    // The malformed row is nameable, so a person can find it; the string row is not.
    expect(rejected[0]?.name).toBe('Travel Mug');
    expect(rejected[0]?.issues.join(' ')).toContain('product.price.amountMinor');
    expect(rejected[1]?.name).toBe('No Images');
    expect(rejected[2]?.name).toBeNull();
  });

  it('stamps each accepted row with the identity it will be created under', () => {
    const { accepted } = partitionElementCatalog([catalogRow('Hero Bottle 500ml')]);
    expect(accepted[0]?.slug).toBe('hero-bottle-500ml');
    expect(accepted[0]?.externalKey).toBe('element:hero-bottle-500ml');
    expect(accepted[0]?.status).toBe('accepted');
  });

  it('rejects the SECOND row that collides on slug, not the first', () => {
    // `unique (brand_id, kind, external_key)` would reject this at the database anyway,
    // halfway through the import, with nothing pointing at which row caused it.
    const { accepted, rejected } = partitionElementCatalog([
      catalogRow('Hero Bottle'),
      catalogRow('  hero bottle!  '),
    ]);
    expect(accepted.map((entry) => entry.index)).toEqual([0]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.index).toBe(1);
    expect(rejected[0]?.reason).toBe('element_name_conflict');
  });

  it('produces a result the response envelope accepts', () => {
    const partition = partitionElementCatalog([catalogRow('Hero Bottle'), { name: 'broken' }]);
    expect(importElementCatalogResponseSchema.safeParse(partition).success).toBe(true);
  });

  it('accepts an empty submission without inventing rows', () => {
    expect(partitionElementCatalog([])).toEqual({ accepted: [], rejected: [] });
  });
});

describe('importElementCatalogRequestSchema', () => {
  it('takes rows as unknown so a bad row cannot fail the envelope', () => {
    const parsed = importElementCatalogRequestSchema.parse({
      brandId: UUID('22222222'),
      rows: [catalogRow('Hero Bottle'), { total: 'nonsense' }],
    });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.category).toBe('product');
  });

  it('still fences what is cheap and total — the brand and the row count', () => {
    expect(
      importElementCatalogRequestSchema.safeParse({ brandId: 'not-a-uuid', rows: [{}] }).success,
    ).toBe(false);
    expect(
      importElementCatalogRequestSchema.safeParse({ brandId: UUID('22222222'), rows: [] }).success,
    ).toBe(false);
    expect(
      importElementCatalogRequestSchema.safeParse({
        brandId: UUID('22222222'),
        rows: Array.from({ length: ELEMENT_CATALOG_ROW_LIMIT + 1 }, () => ({})),
      }).success,
    ).toBe(false);
  });
});

describe('matchCatalogRowToElement', () => {
  const existing = [
    { id: UUID('e1111111'), slug: 'hero-bottle', product: { sku: 'HB-500' } },
    { id: UUID('e2222222'), slug: 'travel-mug' },
  ];

  it('recognises a re-imported product by SKU even after it is renamed', () => {
    // "Hero Bottle" becoming "Hero Bottle 500ml" is a rename, not a new product. Matching
    // on slug alone would import a duplicate every quarter.
    expect(
      matchCatalogRowToElement(
        { name: 'Hero Bottle 500ml', product: { sku: '  hb-500 ' } },
        existing,
      ),
    ).toEqual({ action: 'update', elementId: UUID('e1111111'), matchedBy: 'sku' });
  });

  it('falls back to the slug for a product carrying no SKU', () => {
    expect(matchCatalogRowToElement({ name: 'Travel Mug' }, existing)).toEqual({
      action: 'update',
      elementId: UUID('e2222222'),
      matchedBy: 'slug',
    });
    expect(matchCatalogRowToElement({ name: '  Travel  Mug!! ' }, existing)).toEqual({
      action: 'update',
      elementId: UUID('e2222222'),
      matchedBy: 'slug',
    });
  });

  it('never re-derives a key for an Element that already exists', () => {
    // The returned match carries an id and NOTHING else: `slug`/`external_key` were fixed
    // at create and a rename must not be able to move them.
    const match = matchCatalogRowToElement(
      { name: 'Renamed Entirely', product: { sku: 'HB-500' } },
      existing,
    );
    expect(match.action).toBe('update');
    expect('slug' in match).toBe(false);
    expect('externalKey' in match).toBe(false);
  });

  it('creates when nothing matches, under the same identity rules as a single create', () => {
    expect(
      matchCatalogRowToElement({ name: 'Steel Flask', product: { sku: 'SF-1' } }, existing),
    ).toEqual({
      action: 'create',
      slug: 'steel-flask',
      externalKey: elementExternalKey(elementSlug('Steel Flask')),
    });
    expect(matchCatalogRowToElement({ name: 'Steel Flask' }, [])).toEqual({
      action: 'create',
      slug: 'steel-flask',
      externalKey: 'element:steel-flask',
    });
  });

  it('ignores a blank SKU rather than matching every blank-SKU product to each other', () => {
    const blanks = [{ id: UUID('e3333333'), slug: 'something-else', product: { sku: '   ' } }];
    expect(matchCatalogRowToElement({ name: 'Brand New', product: { sku: '' } }, blanks)).toEqual({
      action: 'create',
      slug: 'brand-new',
      externalKey: 'element:brand-new',
    });
  });
});
