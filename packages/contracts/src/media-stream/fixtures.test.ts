import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodTypeAny } from 'zod';

import { MEDIA_STREAM_ERROR_CODES } from './errors';
import {
  mediaStreamPassthroughRequestSchema,
  mediaStreamPassthroughResponseSchema,
  mediaStreamTransferRequestSchema,
  mediaStreamTransferResponseSchema,
  mediaStreamZipRequestSchema,
  mediaStreamZipResponseSchema,
} from './jobs';

/**
 * The TypeScript half of the MediaStream drift guard.
 *
 * This file and `Continuum-MediaStream/tests/contracts_guard.rs` read the SAME
 * directory. Neither owns it. A shape change made on one side and not the other
 * turns exactly one of these two suites red, which is the only reason the
 * Rust↔TS boundary can be trusted without a code generator.
 *
 * Run both with `bun run mediastream:contracts:check`.
 */

const FIXTURES = join(import.meta.dir, 'fixtures');

const SCHEMAS: Record<string, ZodTypeAny> = {
  'passthrough.request': mediaStreamPassthroughRequestSchema,
  'passthrough.response': mediaStreamPassthroughResponseSchema,
  'transfer.request': mediaStreamTransferRequestSchema,
  'transfer.response': mediaStreamTransferResponseSchema,
  'zip.request': mediaStreamZipRequestSchema,
  'zip.response': mediaStreamZipResponseSchema,
};

/** `zip.request.mixed-sources.json` -> `zip.request`. */
function schemaKeyFor(filename: string): string {
  const [job, direction] = filename.split('.');
  return `${job}.${direction}`;
}

function load(dir: string): Array<{ name: string; body: unknown; schema: ZodTypeAny }> {
  return readdirSync(join(FIXTURES, dir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const key = schemaKeyFor(name);
      const schema = SCHEMAS[key];
      if (!schema) {
        throw new Error(
          `fixture ${dir}/${name} has no schema for key '${key}'; ` +
            `filenames must be '<job>.<request|response>.<label>.json'`,
        );
      }
      return {
        name,
        body: JSON.parse(readFileSync(join(FIXTURES, dir, name), 'utf8')),
        schema,
      };
    });
}

describe('media-stream fixture corpus', () => {
  const valid = load('valid');
  const invalid = load('invalid');

  it('has fixtures to check, so an empty directory cannot pass silently', () => {
    // An `allowEmpty`-shaped hole is exactly how a guard stops guarding.
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
  });

  it('covers every job in both directions', () => {
    const covered = new Set(valid.map((fixture) => schemaKeyFor(fixture.name)));
    for (const key of Object.keys(SCHEMAS)) {
      expect(covered).toContain(key);
    }
  });

  for (const fixture of valid) {
    it(`accepts valid/${fixture.name}`, () => {
      const result = fixture.schema.safeParse(fixture.body);
      if (!result.success) {
        throw new Error(
          `valid/${fixture.name} was rejected:\n${JSON.stringify(result.error.issues, null, 2)}`,
        );
      }
      expect(result.success).toBe(true);
    });
  }

  for (const fixture of invalid) {
    it(`rejects invalid/${fixture.name}`, () => {
      const result = fixture.schema.safeParse(fixture.body);
      expect(result.success).toBe(false);
    });
  }
});

describe('media-stream error codes', () => {
  it('matches the checked-in list the Rust guard also reads, in order', () => {
    const corpus = JSON.parse(readFileSync(join(FIXTURES, 'error-codes.json'), 'utf8')) as {
      codes: string[];
    };
    // Order, not just membership: the Rust side compares the sequence too, so a
    // reordering that means nothing to either language still surfaces here
    // rather than silently diverging.
    expect(corpus.codes).toEqual([...MEDIA_STREAM_ERROR_CODES]);
  });
});
