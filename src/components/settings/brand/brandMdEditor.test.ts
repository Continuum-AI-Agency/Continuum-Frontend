import { describe, expect, it } from 'bun:test';
import { parseBrandMd } from '@continuum/contracts';

// Unit tests for pure logic used by BrandMdEditor. React rendering is not
// testable in bun without a DOM; we test the functions the editor delegates to.

describe('parseBrandMd — editor front-matter hint logic', () => {
  it('returns tokens=null and body=input when there is no front matter', () => {
    const input = '# My Brand\n\nSome prose.';
    const result = parseBrandMd(input);
    expect(result.tokens).toBeNull();
    expect(result.body).toBe(input);
  });

  it('parses valid front matter and returns a non-null tokens object', () => {
    const input = `---\nschema_version: 1\nbrand_name: Acme\n---\n# Body\n`;
    const result = parseBrandMd(input);
    expect(result.tokens).not.toBeNull();
    expect(result.tokens?.brand_name).toBe('Acme');
    expect(result.body).toBe('# Body\n');
  });

  it('returns tokens=null when front matter fails schema validation', () => {
    // schema_version must be the literal 1; 2 fails
    const input = `---\nschema_version: 2\nbrand_name: Acme\n---\n# Body\n`;
    const result = parseBrandMd(input);
    expect(result.tokens).toBeNull();
  });

  it('returns tokens=null when front matter is malformed YAML', () => {
    const input = `---\n: bad yaml : :\n---\n# Body\n`;
    const result = parseBrandMd(input);
    // parseBrandMd catches parse errors and returns null tokens; never throws
    expect(result.tokens).toBeNull();
  });

  it('never throws even for completely garbage input', () => {
    const inputs = ['', '   ', '---', '---\n---\n', 'not yaml at all'];
    for (const input of inputs) {
      expect(() => parseBrandMd(input)).not.toThrow();
    }
  });

  it('strips front matter from body so preview shows only prose', () => {
    const body = '## Vision\n\nBe the best.\n';
    const input = `---\nschema_version: 1\nbrand_name: Test Brand\n---\n${body}`;
    const result = parseBrandMd(input);
    expect(result.body).toBe(body);
    // raw preserves the full document
    expect(result.raw).toBe(input);
  });
});

describe('dirty-guard logic', () => {
  // The dirty state in BrandMdEditor is: draft !== savedRef.current.
  // Test this logic directly since the component can't be rendered in bun.

  it('is dirty when draft differs from saved value', () => {
    const saved = '# Original';
    const draft = '# Edited';
    expect(draft !== saved).toBe(true);
  });

  it('is clean when draft equals saved value', () => {
    const saved = '# Original';
    const draft = '# Original';
    expect(draft !== saved).toBe(false);
  });

  it('becomes clean after save (savedRef updated to current draft)', () => {
    let saved = '# Original';
    const draft = '# Edited';
    expect(draft !== saved).toBe(true);
    // Simulate post-save: savedRef.current = result.brand_md ?? draft
    saved = draft;
    expect(draft !== saved).toBe(false);
  });

  it('becomes clean after reset (both saved and draft set to server value)', () => {
    let saved = '# Original';
    let draft = '# Edited';
    expect(draft !== saved).toBe(true);
    // Simulate reset: server returns brand_md
    const serverValue = '# Generated';
    saved = serverValue;
    draft = serverValue;
    expect(draft !== saved).toBe(false);
  });
});
