import { describe, expect, it } from 'bun:test';

import { resolveAdsetName } from './adsetName';

describe('resolveAdsetName', () => {
  it('prefers the wire adset_name over the enrolled map', () => {
    const nameById = new Map([['act_1::a', 'Roster name']]);
    expect(resolveAdsetName({ adset_id: 'act_1::a', adset_name: 'Wire name' }, nameById)).toBe(
      'Wire name',
    );
  });

  it('falls back to the enrolled map when the wire name is missing', () => {
    const nameById = new Map([['act_1::a', 'Roster name']]);
    expect(resolveAdsetName({ adset_id: 'act_1::a' }, nameById)).toBe('Roster name');
    expect(resolveAdsetName({ adset_id: 'act_1::a', adset_name: null }, nameById)).toBe(
      'Roster name',
    );
  });

  it('returns null when no name is known anywhere', () => {
    expect(resolveAdsetName({ adset_id: 'act_1::a' })).toBeNull();
    expect(resolveAdsetName({ adset_id: 'act_1::a', adset_name: null }, new Map())).toBeNull();
  });

  it('treats a blank wire name as absent so a real fallback still wins', () => {
    const nameById = new Map([['act_1::a', 'Roster name']]);
    expect(resolveAdsetName({ adset_id: 'act_1::a', adset_name: '   ' }, nameById)).toBe(
      'Roster name',
    );
  });

  it('treats a blank map entry as absent (null, not empty string)', () => {
    const nameById = new Map([['act_1::a', '  ']]);
    expect(resolveAdsetName({ adset_id: 'act_1::a' }, nameById)).toBeNull();
  });
});
