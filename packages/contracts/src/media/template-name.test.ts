import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_KEY_MAX,
  templateDisplayName,
  templateKeyFor,
  templateKeyFromName,
  renderClientKeyFor,
  templateNameBudget,
  templateNameProblem,
} from './template-name';

describe('templateKeyFromName', () => {
  it('collapses a readable name the way the forge does', () => {
    expect(templateKeyFromName('StarCraft: Remastered Hero')).toBe('starcraft_remastered_hero');
    expect(templateKeyFromName('  Vivo47 EasyFit  ')).toBe('vivo47_easyfit');
  });

  it('refuses the filename an AE project actually carries', () => {
    // `media.assets.file_name` is the designer's own filename (the uuid lives in storage_path),
    // and designers name files like this. It must NEVER be truncated to fit: a shortened key is
    // two templates sharing one root table, and the queue resolves the template FROM the table.
    const real = 'Vivo47_EasyFit_1x1_9x16_16x9_v11_FINAL_APPROVED.aep';
    expect(templateKeyFromName(real)).toBeNull();
    expect(templateNameProblem(real)).toMatch(/too long/);
    // and the same project, named deliberately, is fine
    expect(templateKeyFromName('Vivo47 EasyFit')).toBe('vivo47_easyfit');
  });

  it('says what is wrong in words the form can render', () => {
    expect(templateNameProblem('')).toMatch(/give this template a name/);
    expect(templateNameProblem('   ')).toMatch(/give this template a name/);
    expect(templateNameProblem('***')).toMatch(/at least one letter or number/);
    expect(templateNameProblem('StarCraft Remastered')).toBeNull();
  });

  it('accepts exactly the limit and refuses one past it', () => {
    expect(templateKeyFromName('a'.repeat(TEMPLATE_KEY_MAX))).toHaveLength(TEMPLATE_KEY_MAX);
    expect(templateKeyFromName('a'.repeat(TEMPLATE_KEY_MAX + 1))).toBeNull();
  });
});

describe('templateKeyFor — the tenant prefix', () => {
  it('puts the brand in front, so two brands may share a name', () => {
    expect(templateKeyFor('Summer Sale', 'starcraft')).toBe('starcraft_summer_sale');
    expect(templateKeyFor('Summer Sale', 'vivo47')).toBe('vivo47_summer_sale');
    // ...and those are different tables, which is the whole point
    expect(templateKeyFor('Summer Sale', 'starcraft')).not.toBe(templateKeyFor('Summer Sale', 'vivo47'));
  });

  it('charges the prefix against the same 40 characters', () => {
    expect(templateNameBudget(null)).toBe(TEMPLATE_KEY_MAX);
    expect(templateNameBudget('starcraft')).toBe(TEMPLATE_KEY_MAX - 10);
    // a name that fits unprefixed can stop fitting once the brand is in front, and the message
    // has to quote the budget that actually applies
    const name = 'a'.repeat(TEMPLATE_KEY_MAX - 5);
    expect(templateNameProblem(name)).toBeNull();
    expect(templateNameProblem(name, 'starcraft')).toMatch(/allows 30/);
    expect(templateKeyFor(name, 'starcraft')).toBeNull();
  });

  it('an empty client key is the unprefixed case, not a leading underscore', () => {
    expect(templateKeyFor('Summer Sale', '')).toBe('summer_sale');
    expect(templateKeyFor('Summer Sale', null)).toBe('summer_sale');
  });
});

describe('renderClientKeyFor', () => {
  it('reads as the brand and is unique by construction', () => {
    const id = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
    expect(renderClientKeyFor('StarCraft: Remastered', id)).toBe('starcraft_b17d81');
    // the cut lands on a word boundary rather than mid-word
    expect(renderClientKeyFor('StarCraft Remastered Deluxe', id)).toBe('starcraft_b17d81');
  });

  it('two brands with the SAME name get different keys — the DB will not catch this for us', () => {
    // uniqueness is (brand_id, picinst, environment_key, client_key), which is per brand, so a
    // shared client_key would violate nothing and put both brands on one root table.
    const a = renderClientKeyFor('Acme', '11111111-1111-1111-1111-111111111111');
    const b = renderClientKeyFor('Acme', '22222222-2222-2222-2222-222222222222');
    expect(a).not.toBe(b);
    expect(templateKeyFor('Summer Sale', a)).not.toBe(templateKeyFor('Summer Sale', b));
  });

  it('a brand with no usable name still gets a key', () => {
    expect(renderClientKeyFor('', '33333333-3333-3333-3333-333333333333')).toBe('brand_333333');
    expect(renderClientKeyFor('!!!', '33333333-3333-3333-3333-333333333333')).toBe('brand_333333');
  });

  it('leaves a workable name budget', () => {
    const key = renderClientKeyFor('StarCraft: Remastered', 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc');
    expect(templateNameBudget(key)).toBeGreaterThanOrEqual(20);
    expect(templateNameProblem('Summer Sale 2026', key)).toBeNull();
  });
});

describe('templateDisplayName', () => {
  it('turns a build key into words', () => {
    expect(templateDisplayName('forge_bench_starcraft')).toBe('Forge bench starcraft');
    expect(templateDisplayName('summer-sale')).toBe('Summer sale');
  });

  it('drops the forge draft marker and any other bracket prefix', () => {
    expect(templateDisplayName('[DRAFT/agent] StarCraft Promo')).toBe('StarCraft Promo');
    expect(templateDisplayName('[DRAFT/agent] [v2] hero_card')).toBe('Hero card');
  });

  it('drops project extensions', () => {
    expect(templateDisplayName('Vivo47_EasyFit.aep')).toBe('Vivo47 EasyFit');
    expect(templateDisplayName('promo.AEPX')).toBe('Promo');
    expect(templateDisplayName('promo.aet')).toBe('Promo');
    expect(templateDisplayName('package.zip')).toBe('Package');
  });

  it('drops uuids, whole or truncated, and long hex runs', () => {
    expect(templateDisplayName('forge-bench-d2f9637b-8fde-492b-aee6-aa37…')).toBe('Forge bench');
    expect(templateDisplayName('d2f9637b-8fde-492b-aee6-aa3712345678.aep')).toBe(
      'Untitled template',
    );
    expect(templateDisplayName('hero_3f9a0c2b7e41d9aa_final')).toBe('Hero final');
    // a word spelled only in a–f letters is not an identifier
    expect(templateDisplayName('facade_deadbeef')).toBe('Facade deadbeef');
    // a short number that happens to be hex stays
    expect(templateDisplayName('promo_2026')).toBe('Promo 2026');
  });

  it('never returns an empty name', () => {
    expect(templateDisplayName('')).toBe('Untitled template');
    expect(templateDisplayName(null)).toBe('Untitled template');
    expect(templateDisplayName(undefined)).toBe('Untitled template');
    expect(templateDisplayName('[DRAFT/agent]   ')).toBe('Untitled template');
  });
});
