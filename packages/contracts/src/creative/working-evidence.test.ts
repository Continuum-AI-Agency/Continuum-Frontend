import { describe, expect, it } from 'bun:test';
import {
  renderDirectionIndex,
  selectDirectionIndex,
  type ProvenDirection,
} from './direction-index';
import { renderWorkingEvidence, workingEvidenceSchema } from './working-evidence';
import { artDirectionSchema } from './art-direction';

const direction = artDirectionSchema.parse({
  heroSubject: 'A founder',
  action: 'lifting the bottle',
  environment: 'a sunlit counter',
  camera: { angle: 'low-angle', framing: 'medium-close-up', lens: '35mm' },
  light: { direction: 'camera-left', quality: 'hard-sun', shadow: 'crisp' },
  palette: { dominant: 'navy', support: 'white', accent: 'orange' },
});

const entry = (summary: string, draftId: string, note?: string): ProvenDirection => ({
  summary,
  draftId,
  performanceNote: note ?? null,
  direction,
});

describe('workingEvidenceSchema', () => {
  it('is entirely optional — a brand with no history still generates', () => {
    expect(workingEvidenceSchema.safeParse({}).success).toBe(true);
  });

  it('stays loose — it is a wire DTO, not a validator second-guessing the analysis', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(workingEvidenceSchema.safeParse({ provenHooks: many }).success).toBe(true);
    // Extra keys ride along rather than failing the whole generation call.
    expect(workingEvidenceSchema.safeParse({ provenAngles: ['x'] }).success).toBe(true);
  });
});

describe('renderWorkingEvidence', () => {
  it('renders nothing when there is nothing measured', () => {
    expect(renderWorkingEvidence(null)).toBe('');
    expect(renderWorkingEvidence({ basis: 'last 30 days' })).toBe('');
  });

  it('tells the model to reuse the winning wording rather than paraphrase it', () => {
    const block = renderWorkingEvidence({
      provenHooks: ['I stopped doing X'],
      provenCtas: ['Comment RECIPE'],
      basis: 'top 5 reels by hook rate, last 30 days',
    });
    expect(block).toContain('reuse the structure, not a paraphrase');
    expect(block).toContain('keep the wording that earned the click');
    expect(block).toContain('- I stopped doing X');
    expect(block).toContain('Basis: top 5 reels by hook rate, last 30 days.');
  });
});

describe('direction index', () => {
  it('lists labels and provenance, never the full directions', () => {
    const block = renderDirectionIndex([entry('low angle · hard sun', 'd1', '3.1% hook rate')]);
    expect(block).toContain('1. low angle · hard sun — 3.1% hook rate [draft d1]');
    // The whole point: the bodies stay out of context until one is chosen.
    expect(block).not.toContain('heroSubject');
    expect(block).not.toContain('35mm');
  });

  it('is empty when the brand has no history yet', () => {
    expect(renderDirectionIndex([])).toBe('');
  });

  it('deduplicates by look so five reels in one style do not fill the index', () => {
    const chosen = selectDirectionIndex([
      entry('low angle · hard sun', 'd1'),
      entry('low angle · hard sun', 'd2'),
      entry('overhead · softbox', 'd3'),
    ]);
    expect(chosen.map((c) => c.draftId)).toEqual(['d1', 'd3']);
  });

  it('caps the index', () => {
    const many = Array.from({ length: 20 }, (_u, i) => entry(`look ${i}`, `d${i}`));
    expect(selectDirectionIndex(many).length).toBe(8);
    expect(selectDirectionIndex(many, 3).length).toBe(3);
  });
});
