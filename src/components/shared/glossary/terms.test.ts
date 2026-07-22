import { describe, expect, it } from 'bun:test';

import { GLOSSARY_TERMS, type GlossaryTermKey, glossaryEntry } from './terms';

const REQUIRED_TERMS: GlossaryTermKey[] = [
  'dco',
  'roas',
  'hyperframes',
  'mcp',
  'percentile-heatmap',
];

describe('GLOSSARY_TERMS', () => {
  it('defines every advanced term IMP-018 calls out', () => {
    for (const key of REQUIRED_TERMS) {
      expect(GLOSSARY_TERMS[key]).toBeDefined();
    }
  });

  it('gives each term a name and a one-line plain-English definition', () => {
    for (const entry of Object.values(GLOSSARY_TERMS)) {
      expect(entry.term.trim().length).toBeGreaterThan(0);
      expect(entry.short.trim().length).toBeGreaterThan(20);
    }
  });
});

describe('glossaryEntry', () => {
  it('returns the entry for a given key', () => {
    expect(glossaryEntry('roas').term).toBe('ROAS');
    expect(glossaryEntry('mcp').short).toMatch(/Model Context Protocol/);
  });
});
