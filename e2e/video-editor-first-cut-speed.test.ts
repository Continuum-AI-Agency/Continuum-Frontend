// f34's speed note, graded by the real scorecard at $0. RED: the envelope the spec printed
// before (one prose `first draft …, redraft …` note) gives the grader no samples. GREEN: the
// note carries each draft's Draft-click-to-summary time, and the grader finds exactly those.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import features from '../../scripts/video-studio/features.json';
import { grade } from '../../scripts/video-studio/scorecard.mjs';
import { firstCutSpeedNote } from './video-editor-first-cut-speed';

const f34 = features.find((feature) => feature.id === 'f34');
if (!f34) throw new Error('features.json has no f34');

const summary = ['A', 'B', 'C'];
/** The 2026-10-08 postledger run's two drafts (its redraft was timed from the reopen). */
const RUN = [
  { ms: 33_500, failure: '', summary },
  { ms: 7_700, failure: '', summary },
];
const BEFORE = ['first draft 33.5 s, redraft 7.7 s, over 120.0 s of footage'];

const envelope = (notes: string[], startedAt: string) =>
  JSON.stringify({ bench: f34?.bench, startedAt, exitCode: 0, results: [], notes });
const hash = (log: string) => createHash('sha256').update(log).digest('hex');

/** Grade one run, or several: the first is the proof, the rest its speed evidence. */
function graded(runs: string[][], feature = f34) {
  const logs = runs.map((notes, index) => envelope(notes, `run ${index}`));
  const results = [{ step: 'works', grade: 'PASS' }];
  const sources = logs.map((log) => JSON.stringify({ ...JSON.parse(log), results }));
  return grade(
    feature,
    {
      bench: f34?.bench,
      log: 'run-0.log',
      sha256: hash(sources[0] ?? ''),
      worksSteps: ['works'],
      qualitySteps: ['works'],
      speedKey: 'draft',
      speedEvidence: sources.slice(1).map((log, index) => ({
        log: `run-${index + 1}.log`,
        sha256: hash(log),
      })),
    },
    (file: string) => sources[Number(file.match(/\d+/)?.[0])] ?? '',
  );
}

const samplesOf = (note: string) => JSON.parse(note.slice('speed samples: '.length));

describe('f34 speed samples', () => {
  test('RED: the envelope without the note gives the grader no samples', () => {
    const result = graded([BEFORE]);
    expect(result.works).toBe(true);
    expect(result.speed).toBe(false);
    expect(result.missing).toContain('Need 3 representative samples within 25000ms.');
  });

  test('each draft that reached its summary is one sample; a failed draft is none', () => {
    const note = firstCutSpeedNote(RUN);
    expect(note.startsWith('speed samples: ')).toBe(true);
    expect(samplesOf(note)).toEqual({ draft: [33_500, 7_700] });
    expect(
      samplesOf(firstCutSpeedNote([...RUN, { ms: 900_000, failure: 'Draft failed', summary: [] }])),
    ).toEqual({ draft: [33_500, 7_700] });
  });

  test('one run gives 2 of the 3 samples; a second run brings 4, each held to 25 s', () => {
    const note = firstCutSpeedNote(RUN);
    const roomy = { ...f34, speedCeilingMs: 40_000 };
    expect(graded([[...BEFORE, note]], roomy).speed).toBe(false);
    expect(graded([[...BEFORE, note], [note]], roomy).speed).toBe(true);
    // 33.5 s is over the 25 s ceiling: the real feature stays unbound on that run.
    expect(graded([[...BEFORE, note], [note]]).speed).toBe(false);
  });
});
