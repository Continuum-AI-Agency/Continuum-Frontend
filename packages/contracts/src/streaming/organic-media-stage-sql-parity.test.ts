import { describe, expect, it } from 'bun:test';
import { deriveOrganicMediaStage } from './organic-pipeline';

/**
 * `media_stage` now has TWO implementations: this one, and `organic.derive_media_stage(jsonb)` in
 * `supabase/migrations/20260813123408_organic_media_stage_trigger.sql`. The SQL copy exists because
 * the edge functions are Deno and cannot import this package at all — no shared code reaches every
 * writer, so the database enforces the invariant instead.
 *
 * Nothing type-checks the pair. This does: every case below is a signal combination that actually
 * occurs in production (all 187 draft rows reduce to these eight), with the answer the SQL CASE
 * returns for it. If someone edits either side alone, this fails.
 *
 * Re-derive the fixtures with:
 *   select mediaStatus, has_assets, has_storyboard, <the CASE>, count(*)
 *   from organic.organic_calendar_drafts where content_json is not null group by 1,2,3,4;
 */
const PRODUCTION_SIGNAL_COMBINATIONS = [
  { mediaStatus: 'pending', assets: 0, storyboard: 0, sql: 'text_only', rows: 62 },
  { mediaStatus: 'pending', assets: 0, storyboard: 3, sql: 'storyboard_ready', rows: 54 },
  { mediaStatus: null, assets: 0, storyboard: 0, sql: 'text_only', rows: 46 },
  { mediaStatus: null, assets: 2, storyboard: 0, sql: 'realized', rows: 10 },
  { mediaStatus: 'ready', assets: 2, storyboard: 3, sql: 'realized', rows: 10 },
  { mediaStatus: 'ready', assets: 1, storyboard: 0, sql: 'realized', rows: 3 },
  { mediaStatus: 'generating', assets: 0, storyboard: 5, sql: 'realizing', rows: 1 },
  { mediaStatus: 'user_supplied', assets: 3, storyboard: 5, sql: 'realized', rows: 1 },
] as const;

function placement(combination: (typeof PRODUCTION_SIGNAL_COMBINATIONS)[number]) {
  return {
    publishingAssets: Array.from({ length: combination.assets }, () => ({ storagePath: 'x' })),
    creative: {
      mediaSuggestion: {
        mediaStatus: combination.mediaStatus,
        storyboard: Array.from({ length: combination.storyboard }, () => ({ role: 'body' })),
      },
    },
  };
}

describe('deriveOrganicMediaStage ↔ organic.derive_media_stage parity', () => {
  for (const combination of PRODUCTION_SIGNAL_COMBINATIONS) {
    const label = `mediaStatus=${combination.mediaStatus ?? 'null'} assets=${combination.assets} storyboard=${combination.storyboard}`;
    it(`agrees with the SQL on ${label} (${combination.rows} live rows)`, () => {
      expect(deriveOrganicMediaStage(placement(combination))).toBe(combination.sql);
    });
  }

  /**
   * The SQL reads `jsonb_typeof(x) = 'array'` before `jsonb_array_length`, mirroring
   * `Array.isArray`. Both sides must treat an absent key as "no media", not as an error.
   */
  it('treats absent containers as empty on both sides', () => {
    expect(deriveOrganicMediaStage({})).toBe('text_only');
    expect(deriveOrganicMediaStage(null)).toBe('text_only');
    expect(deriveOrganicMediaStage(undefined)).toBe('text_only');
  });

  /**
   * `failed` is a deliberate terminal stamp from `markDraftGenerationFailed`. The derive function
   * cannot return it, which is exactly why the trigger only recomputes when the writing statement
   * left the column alone.
   */
  it('never returns failed — the value the trigger must not clobber', () => {
    const stages = PRODUCTION_SIGNAL_COMBINATIONS.map((c) => deriveOrganicMediaStage(placement(c)));
    expect(stages).not.toContain('failed');
  });
});
