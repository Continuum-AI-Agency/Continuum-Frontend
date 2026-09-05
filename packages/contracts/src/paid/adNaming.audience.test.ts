import { describe, expect, test } from 'bun:test';
import { type AdNamingSchemaConfig, audienceFromAdName } from './adNaming';
import { buildCreativeRequestBrief } from '../creative-strategy/paid';

// The real EasyFit convention: `CAÑADAS // 50% ANUALIDAD // AGOSTO`.
const schema: AdNamingSchemaConfig = {
  id: '11111111-2222-4333-8444-555555555555',
  brand_id: '11111111-2222-4333-8444-666666666666',
  platform: 'meta',
  delimiter: '//',
  fields: ['branch', 'offer', 'month'],
  version: 1,
};

describe('the ad set name is the only audience source with data', () => {
  test('branch and offer come back verbatim', () => {
    const audience = audienceFromAdName('CAÑADAS // 50% ANUALIDAD // AGOSTO', schema);
    expect(audience.matched).toBe(true);
    expect(audience.branch).toBe('CAÑADAS');
    expect(audience.offerText).toBe('50% ANUALIDAD');
  });

  // A name that lost or gained a segment has SHIFTED: reading position 2 as the offer would
  // hand the renderer a month as a commercial claim. Unknown is the correct answer.
  test('a name that does not fit the schema yields unknown, never a guess', () => {
    const audience = audienceFromAdName('CAÑADAS // AGOSTO', schema);
    expect(audience.matched).toBe(false);
    expect(audience.offerText).toBeNull();
    expect(audience.branch).toBeNull();
  });

  test('no schema configured is unknown, not an error', () => {
    expect(audienceFromAdName('anything at all', null).matched).toBe(false);
  });

  test('a label the brand did not name simply stays null', () => {
    const audience = audienceFromAdName('CAÑADAS // 50% ANUALIDAD // AGOSTO', schema);
    expect(audience.strategy).toBeNull();
  });
});

describe('the brief quotes the offer instead of inventing one', () => {
  const seed = { adSetId: '120210000000000', groundedOn: [] };

  test('the offer appears VERBATIM in the brief', () => {
    const audience = audienceFromAdName('ITESO // $12 PRIMER MES // AGOSTO', schema);
    const brief = buildCreativeRequestBrief({ ...seed, audience }, 'creative_refresh');
    expect(brief.brief).toContain('$12 PRIMER MES');
    expect(brief.audience?.offerText).toBe('$12 PRIMER MES');
  });

  // The failure this whole line of work exists to stop: a fabricated free-trial claim on a
  // creative bound for a live ad account.
  test('an unparsed name forbids commercial claims rather than leaving a gap', () => {
    const audience = audienceFromAdName('a name that does not fit', schema);
    const brief = buildCreativeRequestBrief({ ...seed, audience }, 'creative_refresh');
    expect(brief.brief).toContain('UNKNOWN');
    expect(brief.brief).toMatch(/no commercial claim/i);
  });

  test('no audience read at all leaves the brief as it was', () => {
    const brief = buildCreativeRequestBrief(seed, 'creative_refresh');
    expect(brief.audience).toBeNull();
    expect(brief.brief).not.toMatch(/UNKNOWN/);
  });
});
