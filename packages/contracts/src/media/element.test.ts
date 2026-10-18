import { describe, expect, it } from 'bun:test';
import { dropConflictingShortcuts, parseShortcutTokens } from '../skills/shortcuts';
import {
  buildElementReferenceLabel,
  buildElementReferencePrompt,
  createElementRequestSchema,
  defaultElementUseIntent,
  ELEMENT_CATALOG_ROW_LIMIT,
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  ELEMENT_PERSON_FALLBACK_LIMIT,
  ELEMENT_REFERENCE_TAG,
  type ElementCategory,
  elementExternalKey,
  elementOriginRefSchema,
  elementProductFactsSchema,
  elementRecordSchema,
  elementReferenceAspectRatio,
  elementSlug,
  elementSourceAssetId,
  importElementCatalogRequestSchema,
  importElementCatalogResponseSchema,
  isElementPersonCategory,
  isElementProductCategory,
  matchCatalogRowToElement,
  partitionElementCatalog,
  resolveElementRefs,
  updateElementRequestSchema,
  withElementStyleTokens,
} from './element';
import { HIDDEN_LIBRARY_TAGS } from './library-browse';

const members = (count: number) =>
  Array.from({ length: count }, (_unused, index) => ({
    assetId: `0000000${index}-0000-4000-8000-000000000000`,
    position: index,
  }));

describe('buildElementReferencePrompt', () => {
  it('covers every category with a wide reference-sheet prompt', () => {
    // The aspect ratio is the assertion that matters: if it is ever omitted, Gemini
    // inherits the ratio of the LAST input image and whichever member happens to sit
    // last silently decides the output shape.
    expect(ELEMENT_CATEGORIES).toHaveLength(14);
    for (const category of ELEMENT_CATEGORIES) {
      const built = buildElementReferencePrompt(category, 3);
      expect(built.prompt.length).toBeGreaterThan(200);
      expect(built.aspectRatio).toMatch(/^\d+:\d+$/);
      if (!isElementPersonCategory(category) && !isElementProductCategory(category)) {
        expect(built.aspectRatio).toBe(elementReferenceAspectRatio(category));
      }
      expect(built.prompt).toContain('multi-panel sheet');
      expect(built.prompt).toContain('authoritative names and facts');
    }
  });

  it('uses the researched aspect ratio per category', () => {
    // A person's reference is the portrait continuity sheet, not the one-call board.
    expect(elementReferenceAspectRatio('model')).toBe('3:4');
    expect(elementReferenceAspectRatio('character')).toBe('3:4');
    expect(elementReferenceAspectRatio('setting')).toBe('16:9');
    // So is a product's and an object's: the product continuity sheet.
    expect(elementReferenceAspectRatio('product')).toBe('3:4');
    expect(elementReferenceAspectRatio('object')).toBe('3:4');
    expect(elementReferenceAspectRatio('moodboard')).toBe('16:9');
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
    expect(buildElementReferencePrompt('model', 5).prompt).toContain('The 5 attached images');
    expect(buildElementReferencePrompt('model', 2).prompt).toContain('The 2 attached images');
  });

  it('keeps all model-rendered text off the sheet', () => {
    for (const category of ELEMENT_CATEGORIES) {
      expect(buildElementReferencePrompt(category, 2).prompt).toContain(
        'Do not render labels or other text',
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
      'distinguishing-mark close-ups',
    );
    expect(buildElementReferencePrompt('character', 3).prompt).toContain('exact costume');
  });

  it('handles a single member without breaking the manifest', () => {
    const built = buildElementReferencePrompt('general', 1);
    expect(built.prompt.match(/^- Image \d+:/gm)).toHaveLength(1);
    expect(built.prompt).toContain('The 1 attached images');
  });

  it('uses ordered keyframes for motion Elements', () => {
    expect(buildElementReferencePrompt('animation', 4).prompt).toContain('ordered keyframes');
    expect(buildElementReferencePrompt('effect', 4).prompt).toContain('dissipation');
  });
});

describe('defaultElementUseIntent', () => {
  it('derives a useful placement default without fixing how the Element must be used', () => {
    expect(defaultElementUseIntent('product')).toBe('subject');
    expect(defaultElementUseIntent('location')).toBe('environment');
    expect(defaultElementUseIntent('style')).toBe('treatment');
    expect(defaultElementUseIntent('palette')).toBe('palette');
    expect(defaultElementUseIntent('animation')).toBe('motion');
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
        {
          name: '500ml / Matte Black',
          sku: 'HB-500-MB',
          price: { amountMinor: 1999, currency: 'USD' },
        },
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
    expect(before.prompt).toContain('label, closure, material and base-marking close-ups');
    expect(before.prompt).toContain('authoritative names and facts');
    expect(before.aspectRatio).toBe('16:9');
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

describe('Element boards and style tags', () => {
  const brandId = '11111111-1111-4111-8111-111111111111';
  const [front, label] = members(2).map((member) => member.assetId) as [string, string];

  it('accepts roles, style slugs and linked boards on create and update', () => {
    const body = {
      brandId,
      name: 'Hero bottle',
      category: 'product' as const,
      memberAssetIds: [front, label],
      memberRoles: { [front]: 'front', [label]: 'label' },
      styleSlugs: ['goldenhour', '35mm-film'],
      boardElementIds: [brandId],
    };
    expect(createElementRequestSchema.parse(body).memberRoles).toEqual(body.memberRoles);
    expect(updateElementRequestSchema.parse({ brandId, styleSlugs: [] }).styleSlugs).toEqual([]);
  });

  it('refuses a role outside the vocabulary, a slug carrying its slash, and too many of each', () => {
    const base = { brandId, name: 'x', category: 'product' as const, memberAssetIds: [front] };
    expect(
      createElementRequestSchema.safeParse({ ...base, memberRoles: { [front]: 'hero' } }).success,
    ).toBe(false);
    expect(
      createElementRequestSchema.safeParse({ ...base, styleSlugs: ['/goldenhour'] }).success,
    ).toBe(false);
    expect(
      createElementRequestSchema.safeParse({
        ...base,
        styleSlugs: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }).success,
    ).toBe(false);
    expect(
      createElementRequestSchema.safeParse({ ...base, boardElementIds: Array(5).fill(brandId) })
        .success,
    ).toBe(false);
  });

  it('reads a stored bag without the new keys as a record without them', () => {
    const origin = elementOriginRefSchema.parse({ category: 'product' });
    expect('memberRoles' in origin).toBe(false);
    expect('styleSlugs' in origin).toBe(false);
    expect('boardElementIds' in origin).toBe(false);
  });

  it('a member may carry its role on the record', () => {
    const record = {
      id: brandId,
      brandId,
      name: 'Hero bottle',
      slug: 'hero-bottle',
      category: 'product',
      guidelines: null,
      rightsNote: null,
      members: [{ assetId: front, position: 0, role: 'front' }],
      referenceHistory: [],
      defaultReferenceAssetId: null,
      styleSlugs: ['goldenhour'],
      createdAt: 'now',
      updatedAt: 'now',
    };
    expect(elementRecordSchema.safeParse(record).success).toBe(true);
  });
});

describe('withElementStyleTokens', () => {
  it('prepends the tokens so the parser reads them before the prompt', () => {
    expect(withElementStyleTokens('a bottle on sand', ['goldenhour', '35mm'])).toBe(
      '/goldenhour /35mm a bottle on sand',
    );
    expect(parseShortcutTokens(withElementStyleTokens('a bottle /8k', ['4k'])).slugs).toEqual([
      '4k',
      '8k',
    ]);
  });

  it('leaves a prompt alone with no slugs, and a blank prompt becomes the tokens', () => {
    expect(withElementStyleTokens('a bottle', [])).toBe('a bottle');
    expect(withElementStyleTokens('  ', ['goldenhour'])).toBe('/goldenhour');
  });

  it("lets the prompt's own slug beat a conflicting Element default", () => {
    const skills = [
      { slug: '4k', tags: ['shortcut', 'conflicts:8k'] },
      { slug: '8k', tags: ['shortcut', 'conflicts:4k'] },
    ];
    const order = parseShortcutTokens(withElementStyleTokens('a bottle /8k', ['4k'])).slugs;
    const resolved = dropConflictingShortcuts(
      order.map((slug) => skills.find((skill) => skill.slug === slug)!),
    );
    expect(resolved.map((skill) => skill.slug)).toEqual(['8k']);
  });
});

describe('elementSourceAssetId', () => {
  const element = {
    category: 'product' as const,
    members: members(2),
    defaultReferenceAssetId: null,
    motionAssetId: '99999999-9999-4999-8999-999999999999',
  };

  it('is the pinned sheet, else the first member, else the motion clip for motion', () => {
    expect(elementSourceAssetId(element, 'subject')).toBe(members(1)[0]!.assetId);
    expect(
      elementSourceAssetId(
        { ...element, defaultReferenceAssetId: element.motionAssetId },
        'subject',
      ),
    ).toBe(element.motionAssetId);
    expect(elementSourceAssetId(element, 'motion')).toBe(element.motionAssetId);
    expect(elementSourceAssetId({ ...element, members: [] }, 'treatment')).toBeUndefined();
  });
});
