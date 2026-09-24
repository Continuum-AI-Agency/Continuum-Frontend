import { describe, expect, it } from 'bun:test';
import {
  confidentFontCandidate,
  type FontCandidate,
  faceOf,
  rankFontCandidates,
} from './font-match';

describe('faceOf', () => {
  it('reads the two Arial names After Effects reports', () => {
    // The whole reason this file exists: both of these read as null before the foundry
    // suffix was stripped, so a template asking for plain Arial offered no way forward.
    expect(faceOf('ArialMT')).toEqual({ family: 'Arial', weight: 400, italic: false });
    expect(faceOf('Arial-BoldMT')).toEqual({ family: 'Arial', weight: 700, italic: false });
  });

  it('peels more than one foundry marker', () => {
    expect(faceOf('TimesNewRomanPSMT')?.family).toBe('Times New Roman');
    expect(faceOf('HelveticaNeueLTStd-Bold')).toEqual({
      family: 'Helvetica Neue',
      weight: 700,
      italic: false,
    });
  });

  it('keeps the split fontHeal already depends on', () => {
    expect(faceOf('PlusJakartaSans-ExtraBoldItalic')).toEqual({
      family: 'Plus Jakarta Sans',
      weight: 800,
      italic: true,
    });
    expect(faceOf('Sora-SemiBold')).toEqual({ family: 'Sora', weight: 600, italic: false });
  });

  it('refuses to guess a style word it cannot read', () => {
    expect(faceOf('HeadingNow-36CompBold')).toBeNull();
    expect(faceOf('Urbanchrome-Condensed')).toBeNull();
  });

  it('does not eat a family that merely ends in those letters', () => {
    // `MT` alone is a family called MT, not an empty name.
    expect(faceOf('MT')?.family).toBe('MT');
  });
});

describe('rankFontCandidates', () => {
  const held: FontCandidate[] = [
    { fontId: 'a', family: 'Arial', postScriptName: 'ArialMT', weight: 400, style: 'normal' },
    { fontId: 'b', family: 'Arial', postScriptName: 'Arial-BoldMT', weight: 700, style: 'normal' },
    {
      fontId: 'c',
      family: 'Poppins',
      postScriptName: 'Poppins-Bold',
      weight: 700,
      style: 'normal',
    },
    { fontId: 'd', family: 'Sora', postScriptName: 'Sora-Light', weight: 300, style: 'normal' },
  ];

  it('puts the same typeface at the same weight first', () => {
    const ranked = rankFontCandidates('Arial-BoldMT', held);
    expect(ranked[0]).toMatchObject({ fontId: 'b', score: 90 });
    // Same family, wrong cut beats a different family at the right cut.
    expect(ranked.map((entry) => entry.fontId)).toEqual(['b', 'a', 'c']);
    // Sora is neither the family nor the weight, so it is not offered at all.
    expect(ranked.some((entry) => entry.fontId === 'd')).toBe(false);
  });

  it('still offers the family when the style word is unreadable', () => {
    // `36CompBold` is not a cut we can read, so nothing can claim the same cut — but the
    // family still matches, which is the answer a person wants to see.
    const ranked = rankFontCandidates('HeadingNow-36CompBold', [
      ...held,
      { fontId: 'e', family: 'HeadingNow', postScriptName: null, weight: 700, style: 'normal' },
    ]);
    expect(ranked[0]).toMatchObject({ fontId: 'e', score: 60 });
    expect(ranked).toHaveLength(1);
  });

  it('orders ties the same way on every call', () => {
    const shuffled = [held[1], held[0]].filter(Boolean) as FontCandidate[];
    expect(rankFontCandidates('Arial-BoldMT', shuffled).map((entry) => entry.fontId)).toEqual(
      rankFontCandidates('Arial-BoldMT', held.slice(0, 2)).map((entry) => entry.fontId),
    );
  });
});

describe('confidentFontCandidate', () => {
  it('pre-selects an unambiguous same-cut match', () => {
    const ranked = rankFontCandidates('Arial-BoldMT', [
      { fontId: 'b', family: 'Arial', postScriptName: 'Arial-BoldMT', weight: 700 },
      { fontId: 'c', family: 'Poppins', postScriptName: 'Poppins-Bold', weight: 700 },
    ]);
    expect(confidentFontCandidate(ranked)?.fontId).toBe('b');
  });

  it('pre-selects nothing when two faces tie at the top', () => {
    // Two cuts both claiming to be Arial Bold is exactly when a person must look.
    const ranked = rankFontCandidates('Arial-BoldMT', [
      { fontId: 'b', family: 'Arial', postScriptName: 'Arial-BoldMT', weight: 700 },
      { fontId: 'b2', family: 'Arial', postScriptName: 'Arial-BoldMT', weight: 700 },
    ]);
    expect(ranked[0]?.score).toBe(90);
    expect(confidentFontCandidate(ranked)).toBeUndefined();
  });

  it('never pre-selects a mere family match', () => {
    const ranked = rankFontCandidates('Arial-BoldMT', [
      { fontId: 'a', family: 'Arial', postScriptName: 'ArialMT', weight: 400 },
    ]);
    expect(ranked[0]?.score).toBe(60);
    expect(confidentFontCandidate(ranked)).toBeUndefined();
  });
});
