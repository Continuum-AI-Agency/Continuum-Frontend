import { describe, expect, it } from 'bun:test';
import { CUT_RUNGS_SEC } from '@continuum/contracts';
import { type FastCutPreview, fastCutPreview, fastCutSettings } from './fastCutPreview';

const ok = (preview: FastCutPreview) => {
  if (!preview.ok) throw new Error(`preview failed: ${preview.error}`);
  return preview;
};

/** The rungs a preview actually cuts on, longest first. */
const usedRungs = (preview: FastCutPreview) =>
  ok(preview)
    .rungs.filter((row) => row.cuts > 0)
    .map((row) => row.rung);

const cutsAt = (preview: FastCutPreview, rung: number) =>
  ok(preview).rungs.find((row) => row.rung === rung)?.cuts;

describe('fastCutSettings', () => {
  it('fills the schema defaults into a node saved without them', () => {
    expect(fastCutSettings({})).toEqual({
      pacing: 'build',
      rung: undefined,
      bars: 4,
      transients: ['flash', 'punch', 'rgb-shift'],
    });
  });

  it('keeps what the node holds and ignores run-filed keys', () => {
    expect(
      fastCutSettings({
        pacing: 'steady',
        rung: 0.2,
        bars: 8,
        transients: ['shake'],
        generatedVideoUrl: 'https://cdn.test/cut.mp4',
        isExecuting: false,
      }),
    ).toEqual({ pacing: 'steady', rung: 0.2, bars: 8, transients: ['shake'] });
  });

  it('reads unreadable settings as the defaults rather than throwing', () => {
    expect(fastCutSettings({ pacing: 'chaos', bars: 99 })).toEqual(fastCutSettings({}));
  });
});

describe('fastCutPreview', () => {
  it('reports one row per rung of the ladder, longest first', () => {
    const preview = ok(fastCutPreview(fastCutSettings({})));
    expect(preview.rungs.map((row) => row.rung)).toEqual([...CUT_RUNGS_SEC]);
  });

  it('puts cuts on every rung for build, summing to the total, at 60 fps', () => {
    const preview = ok(fastCutPreview(fastCutSettings({ pacing: 'build', bars: 4 })));
    expect(usedRungs(preview)).toEqual([...CUT_RUNGS_SEC]);
    expect(preview.rungs.reduce((sum, row) => sum + row.cuts, 0)).toBe(preview.totalCuts);
    expect(preview.fps).toBe(60);
  });

  it('cuts steady on its one rung only, at 30 fps above 0.1 s', () => {
    const preview = fastCutPreview({ pacing: 'steady', rung: 0.2, bars: 4, transients: [] });
    expect(usedRungs(preview)).toEqual([0.2]);
    expect(cutsAt(preview, 0.2)).toBe(32);
    expect(ok(preview).fps).toBe(30);
  });

  it('defaults steady to 0.4 s and runs at 60 fps from 0.1 s down', () => {
    expect(usedRungs(fastCutPreview({ pacing: 'steady', bars: 4, transients: [] }))).toEqual([0.4]);
    const fast = fastCutPreview({ pacing: 'steady', rung: 0.1, bars: 4, transients: [] });
    expect(ok(fast).fps).toBe(60);
  });

  it('measures the montage on the 150 BPM grid: four beats of 0.4 s a bar', () => {
    expect(ok(fastCutPreview({ pacing: 'steady', bars: 4, transients: [] })).durationSec).toBe(6.4);
    expect(ok(fastCutPreview({ pacing: 'build', bars: 16, transients: [] })).durationSec).toBe(
      25.6,
    );
  });

  it('cuts stutter on its base and its bursts only', () => {
    expect(usedRungs(fastCutPreview({ pacing: 'stutter', bars: 4, transients: [] }))).toEqual([
      0.4, 0.05,
    ]);
    expect(
      usedRungs(fastCutPreview({ pacing: 'stutter', rung: 0.8, bars: 4, transients: [] })),
    ).toEqual([0.8, 0.1]);
  });

  it('holds drop-hit on long cuts before the drop and 0.2 s cuts after it', () => {
    const preview = fastCutPreview({ pacing: 'drop-hit', bars: 4, transients: [] });
    expect(cutsAt(preview, 1)).toBeGreaterThan(0);
    expect(cutsAt(preview, 0.2)).toBeGreaterThan(0);
    expect(cutsAt(preview, 0.05)).toBe(0);
    expect(ok(preview).fps).toBe(30);
  });

  it("returns the planner's refusal instead of throwing", () => {
    // Past the node's 16-bar ceiling, 0.05 s cuts exceed the planner's 720-cut limit.
    const refused = fastCutPreview({ pacing: 'steady', rung: 0.05, bars: 30, transients: [] });
    expect(refused).toEqual({
      ok: false,
      error: expect.stringContaining('cut_plan_too_many_cuts'),
    });
  });
});
