import { describe, expect, it } from 'bun:test';
import {
  allocateRuleId,
  type DesignComplaint,
  isEnforced,
  type LearnedRule,
  learnedRuleSchema,
  notMeasurableReason,
  pendingComplaintSchema,
  proposeRule,
  type RuleDraft,
  ruleTerms,
} from './learned-rules';

/** A rule that runs: Verne's R01, which `auditoria.py` actually executes. */
const R01: LearnedRule = {
  id: 'R01',
  name: 'No logo is ever cropped',
  forbidden: 'An ally logo or the UP crest cut off by the canvas edge',
  measurement: 'ink within 4 % of the left edge inside the logo strip',
  severity: 'blocking',
  origin: 'hand-authored',
  originNote: 'reported 2026-08-10 · the University of London logo ran off in story and totem',
  probableCause: 'the header had no width budget and the last logo landed at negative x',
  recordedOn: '2026-08-10',
  enforcedBy: 'auditoria.py block I',
};

const R02: LearnedRule = {
  id: 'R02',
  name: 'Minimum separation between blocks',
  forbidden: 'The kicker chip touching the logo strip',
  measurement: 'the chip starts at 19-27 % of the photo height',
  severity: 'blocking',
  origin: 'hand-authored',
  recordedOn: '2026-08-10',
  enforcedBy: 'auditoria.py block I',
};

/** A rule that is stored and inert — the state every learned rule starts in. */
const R05: LearnedRule = {
  id: 'R05',
  name: 'The headline is always legible',
  forbidden: 'A navy headline over a zone that cannot hold it',
  measurement: 'contrast >= 4.5:1 against the darkest 20 % of the safe zone',
  severity: 'blocking',
  origin: 'hand-authored',
  recordedOn: '2026-08-10',
  enforcedBy: null,
};

const BANK: readonly LearnedRule[] = [R01, R02, R05];

const complaint: DesignComplaint = {
  text: 'the date block sits on top of the headline',
  reportedOn: '2026-08-26',
};

/** The draft a proposer writes for the complaint above once it has a real measurement. */
const dateBlockDraft: RuleDraft = {
  name: 'The date block never overlaps the headline',
  forbidden: 'The date block drawn on top of the headline text',
  measurement:
    'intersection of the two text boxes = 0 px; minimum separation 2 % of the canvas height',
  severity: 'blocking',
};

describe('learnedRuleSchema', () => {
  it('accepts a rule that carries a measurement', () => {
    expect(learnedRuleSchema.safeParse(R01).success).toBe(true);
  });

  it('refuses a rule with no measurement — the 400 the reference returns', () => {
    expect(learnedRuleSchema.safeParse({ ...R01, measurement: '' }).success).toBe(false);
  });

  it('refuses a whitespace-only measurement, which is the same refusal wearing a disguise', () => {
    const parsed = learnedRuleSchema.safeParse({ ...R01, measurement: '   \n\t ' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('a rule without a measurement is not a rule');
  });

  it('refuses a measurement that admits it cannot measure', () => {
    const marked = { ...R01, measurement: 'not measurable yet: needs a subject detector' };
    expect(learnedRuleSchema.safeParse(marked).success).toBe(false);
  });

  it('requires the enforcement field to be stated, never omitted', () => {
    const { enforcedBy: _dropped, ...withoutEnforcement } = R01;
    expect(learnedRuleSchema.safeParse(withoutEnforcement).success).toBe(false);
  });
});

describe('isEnforced', () => {
  it('distinguishes a rule that runs from one that is only stored', () => {
    expect(isEnforced(R01)).toBe(true);
    expect(isEnforced(R05)).toBe(false);
    // The count a UI must show separately, instead of claiming all three are detected.
    expect(BANK.filter(isEnforced).length).toBe(2);
  });

  it('marks every freshly learned rule as unenforced, because nothing runs it yet', () => {
    const proposal = proposeRule(complaint, BANK, dateBlockDraft);
    expect(proposal.kind).toBe('rule');
    if (proposal.kind !== 'rule') return;
    expect(proposal.rule.enforcedBy).toBeNull();
    expect(isEnforced(proposal.rule)).toBe(false);
  });
});

describe('notMeasurableReason', () => {
  it('keeps the why and drops the marker', () => {
    expect(notMeasurableReason('not measurable yet: needs a measure of where the subject is')).toBe(
      'needs a measure of where the subject is',
    );
  });

  it('reads the reference own Spanish marker', () => {
    expect(notMeasurableReason('no medible todavía: hace falta una medida del sujeto')).toBe(
      'hace falta una medida del sujeto',
    );
  });

  it('returns null for a real measurement', () => {
    expect(notMeasurableReason(R01.measurement)).toBeNull();
  });
});

describe('proposeRule', () => {
  it('files a draft with no measurement as pending, never as a rule', () => {
    const proposal = proposeRule(complaint, BANK, { ...dateBlockDraft, measurement: '  ' });
    expect(proposal.kind).toBe('pending');
    if (proposal.kind !== 'pending') return;
    expect(proposal.complaint.reported).toBe(complaint.text);
    expect(proposal.complaint.reportedOn).toBe('2026-08-26');
    expect(proposal.complaint.whyNotMeasurable).toContain('not a rule');
    // The pending row is storable as-is; the complaint is not dropped on the floor.
    expect(pendingComplaintSchema.safeParse(proposal.complaint).success).toBe(true);
  });

  it('files a "not measurable yet" marker as pending and keeps the explanation', () => {
    const framing: DesignComplaint = {
      text: 'the photo does not frame the subject the way a designer would',
      reportedOn: '2026-08-10',
    };
    const proposal = proposeRule(framing, BANK, {
      name: 'The photo frames the subject',
      forbidden: 'A crop that puts the subject where a designer would not',
      measurement:
        'not measurable yet: the engine picks the crop that best holds the headline, which measures legibility, not composition',
      severity: 'warning',
    });
    expect(proposal.kind).toBe('pending');
    if (proposal.kind !== 'pending') return;
    expect(proposal.complaint.whyNotMeasurable).toBe(
      'the engine picks the crop that best holds the headline, which measures legibility, not composition',
    );
  });

  it('calls a restatement of an existing rule a duplicate, with the id and the reason', () => {
    const reReport: DesignComplaint = {
      text: 'the logo is cut off again on the totem',
      reportedOn: '2026-08-26',
    };
    const proposal = proposeRule(reReport, BANK, {
      name: 'Logos cropped by the canvas edge',
      forbidden: 'A logo cut off by the edge of the canvas',
      measurement: 'no ink from the logo strip within 4 % of any edge',
      severity: 'blocking',
    });
    expect(proposal.kind).toBe('duplicate');
    if (proposal.kind !== 'duplicate') return;
    expect(proposal.ruleId).toBe('R01');
    expect(proposal.ruleName).toBe(R01.name);
    expect(proposal.score).toBeGreaterThanOrEqual(0.6);
    expect(proposal.sharedTerms).toContain('cropped');
    expect(proposal.sharedTerms).toContain('canvas');
    // The framing that matters: this is an engine failure, not a missing rule.
    expect(proposal.reason).toContain('R01');
    expect(proposal.reason).toContain('fix the engine, not the rule list');
  });

  it('does not call a genuinely different complaint a duplicate on one shared word', () => {
    // "headline" alone is shared with R05; one term is a coincidence, not a restatement.
    const proposal = proposeRule(complaint, BANK, dateBlockDraft);
    expect(proposal.kind).toBe('rule');
  });

  it('turns a measurable new complaint into a rule with the next id in sequence', () => {
    const proposal = proposeRule(complaint, BANK, {
      ...dateBlockDraft,
      probableCause: 'the date block is anchored to the canvas, not to the headline box',
    });
    expect(proposal.kind).toBe('rule');
    if (proposal.kind !== 'rule') return;
    const { rule } = proposal;

    expect(rule.id).toBe('R06');
    expect(rule.measurement).toBe(dateBlockDraft.measurement);
    expect(rule.severity).toBe('blocking');
    // The learning loop cannot launder a hand-authored provenance.
    expect(rule.origin).toBe('learned-from-feedback');
    expect(rule.originNote).toBe(`reported 2026-08-26 · ${complaint.text}`);
    expect(rule.probableCause).toBe(
      'the date block is anchored to the canvas, not to the headline box',
    );
    expect(rule.recordedOn).toBe('2026-08-26');
    expect(learnedRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('is pure: the same inputs give the same answer and the bank is untouched', () => {
    const before = JSON.stringify(BANK);
    const a = proposeRule(complaint, BANK, dateBlockDraft);
    const b = proposeRule(complaint, BANK, dateBlockDraft);
    expect(a).toEqual(b);
    expect(JSON.stringify(BANK)).toBe(before);
  });
});

describe('allocateRuleId', () => {
  it('starts at R01 on an empty bank', () => {
    expect(allocateRuleId([])).toBe('R01');
  });

  it('continues one sequence across hand-authored and learned rules', () => {
    const learned: LearnedRule = { ...R05, id: 'R16', origin: 'learned-from-feedback' };
    expect(allocateRuleId([...BANK, learned])).toBe('R17');
  });

  it('takes the highest id, not the last one', () => {
    expect(allocateRuleId([{ id: 'R15' }, { id: 'R02' }])).toBe('R16');
  });

  it('skips malformed ids instead of colliding or crashing on them', () => {
    expect(allocateRuleId([{ id: 'R01' }, { id: 'oops' }, { id: '' }, { id: 'R15x' }])).toBe('R02');
  });

  it('does not pad away a three-digit sequence', () => {
    expect(allocateRuleId([{ id: 'R99' }])).toBe('R100');
  });
});

describe('ruleTerms', () => {
  it('folds accents, drops stopwords, and de-duplicates', () => {
    expect(ruleTerms('El título no se recorta, el título')).toEqual(['titulo', 'recorta']);
  });
});
