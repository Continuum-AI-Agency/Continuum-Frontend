import { describe, expect, it } from 'bun:test';
import type { DesignSystemSnapshot } from '@continuum/contracts';
import {
  deriveBrandFacts,
  deriveColourUsage,
  deriveLayoutSpec,
  deriveRuleLedger,
  deriveTypeInventory,
} from './brandPanels';

const base: DesignSystemSnapshot = {
  schemaVersion: 1,
  brandName: 'Verne',
  sourceKind: 'ds_export',
  rigor: {
    tier: 'strict',
    evidence: {
      tokenCount: 12,
      imperativeRuleCount: 3,
      hasAdherenceConfig: true,
      declaredSectionCount: 2,
      exemplarCount: 0,
    },
    override: null,
  },
  tokens: [],
  fonts: [],
  adherence: { forbidRawHex: false, forbidRawPx: false, fontAllowlist: [], tokenAllowlist: [] },
  sections: [],
  conflicts: [],
};

const withSections = (sections: DesignSystemSnapshot['sections']): DesignSystemSnapshot => ({
  ...base,
  sections,
});

const formatsSection = (
  content: Record<string, unknown>,
): DesignSystemSnapshot['sections'][number] => ({
  section: 'formats',
  title: 'Formats',
  summary: '',
  content,
  rules: [],
  exemplars: [],
  provenance: 'declared',
  confidence: 1,
  enabled: true,
  editedAt: null,
});

describe('deriveLayoutSpec', () => {
  it('renders every value as a ratio or a percentage, never a pixel', () => {
    const spec = deriveLayoutSpec(
      withSections([
        formatsSection({
          baseWidth: 1080,
          formats: [
            {
              id: 'postIG',
              width: 1080,
              height: 1350,
              safeZone: { x0: 0.08, y0: 0.06, x1: 0.92, y1: 0.48 },
            },
            { id: 'story', width: 1080, height: 1920, safeZone: null },
          ],
          curves: {
            photoAspect: {
              unit: 'ratio',
              points: [
                [0.8, 1.567],
                [1.778, 2.224],
              ],
            },
          },
        }),
      ]),
    );

    expect(spec.absent).toBeNull();
    expect(spec.baseWidth).toBe(1080);
    for (const row of spec.rows) expect(row.value).not.toMatch(/px/);
    expect(spec.rows.find((row) => row.label === 'postIG')?.value).toBe('0.800 : 1');
    // The stated-none safe zone stays a statement, not an absence.
    expect(spec.rows.find((row) => row.label === 'story · safe zone')?.value).toBe('none');
    // A measured curve is labelled as measured, and read at a real format's aspect.
    const curve = spec.rows.find((row) => row.label === 'Photo aspect');
    expect(curve?.value).toBe('measured 1.567 – 2.224');
    expect(curve?.note).toContain('at postIG it reads 1.567');
  });

  it('instructs rather than rendering an empty region when there is no formats section', () => {
    const spec = deriveLayoutSpec(base);
    expect(spec.rows).toHaveLength(0);
    expect(spec.absent).toContain('Formats card');
  });
});

describe('deriveTypeInventory', () => {
  const snapshot: DesignSystemSnapshot = {
    ...base,
    fonts: [
      { family: 'Publico', tokens: ['--font-display'], source: null },
      { family: 'Founders Grotesk', tokens: [], source: null },
    ],
    tokens: [
      {
        name: '--w-book',
        value: '400',
        kind: 'other',
        resolvedValue: '400',
        definedIn: null,
        description: null,
      },
      {
        name: '--w-bold',
        value: '700',
        kind: 'other',
        resolvedValue: '700',
        definedIn: null,
        description: null,
      },
    ],
  };

  it('badges a face the store holds apart from one it does not', () => {
    const inventory = deriveTypeInventory(snapshot, [
      { family: 'Publico', weight: 700, style: 'normal', format: 'woff2', bytes: 24_680 },
    ]);

    const held = inventory.rows.find((row) => row.family === 'Publico' && row.weight === 700);
    expect(held?.present).toBe(true);
    expect(held?.detail).toBe('woff2 · 24.1 kB');
    expect(held?.usedFor).toBe('--font-display');

    expect(
      inventory.rows.find((row) => row.family === 'Publico' && row.weight === 400)?.present,
    ).toBe(false);
    expect(inventory.rows.every((row) => row.family !== 'Founders Grotesk' || !row.present)).toBe(
      true,
    );
    expect(inventory.storeUnknown).toBe(false);
  });

  it('keeps "we could not ask" distinct from "there are none"', () => {
    const unknown = deriveTypeInventory(snapshot, null);
    expect(unknown.storeUnknown).toBe(true);
    expect(unknown.rows[0]?.detail).toBe('the engine could not be asked');

    const empty = deriveTypeInventory(snapshot, []);
    expect(empty.storeUnknown).toBe(false);
    expect(empty.rows[0]?.detail).toBe('no file in the store');
  });
});

describe('deriveColourUsage', () => {
  it('gives every colour a usage sentence, and flags the ones nobody wrote', () => {
    const rows = deriveColourUsage({
      ...base,
      tokens: [
        {
          name: '--accent',
          value: '#ffaa1c',
          kind: 'color',
          resolvedValue: '#ffaa1c',
          definedIn: 'tokens.css',
          description: 'Headline, footer and section chips.',
        },
        {
          name: '--ink',
          value: '#101010',
          kind: 'color',
          resolvedValue: '#101010',
          definedIn: null,
          description: null,
        },
        {
          name: '--mist',
          value: '#e4ddce',
          kind: 'color',
          resolvedValue: '#e4ddce',
          definedIn: null,
          description: null,
        },
      ],
      sections: [
        {
          section: 'palette',
          title: 'Palette',
          summary: '',
          content: {},
          rules: [
            {
              statement: 'The headline is ALWAYS #101010.',
              strength: 'hard',
              target: null,
              value: '#101010',
              sourceRef: 'p.14',
            },
          ],
          exemplars: [],
          provenance: 'declared',
          confidence: 1,
          enabled: true,
          editedAt: null,
        },
      ],
    });

    expect(rows.map((row) => row.usage)).toEqual([
      'Headline, footer and section chips.',
      'The headline is ALWAYS #101010.',
      expect.stringContaining('No usage recorded'),
    ]);
    expect(rows.map((row) => row.recorded)).toEqual([true, true, false]);
  });
});

describe('deriveBrandFacts', () => {
  it('shows the provenance gap instead of implying a source', () => {
    const facts = deriveBrandFacts({
      ...base,
      tokens: [
        {
          name: '--accent',
          value: '#ffaa1c',
          kind: 'color',
          resolvedValue: '#ffaa1c',
          definedIn: 'tokens.css',
          description: null,
        },
        {
          name: '--ink',
          value: '#101010',
          kind: 'color',
          resolvedValue: '#101010',
          definedIn: null,
          description: null,
        },
      ],
    });

    expect(facts.rows[0]).toEqual({
      fact: 'The brand is called Verne.',
      provenance: 'the brand record',
    });
    expect(facts.rows[1]?.provenance).toBe('tokens.css');
    expect(facts.rows[2]?.provenance).toBeNull();
    expect(facts.withoutProvenance).toBe(1);
  });
});

describe('deriveRuleLedger', () => {
  const ledger = (adherence: DesignSystemSnapshot['adherence']) =>
    deriveRuleLedger({
      ...base,
      adherence,
      sections: [
        {
          section: 'palette',
          title: 'Palette',
          summary: '',
          content: {},
          rules: [
            {
              statement: 'Accent is the orange.',
              strength: 'hard',
              target: 'artDirection.palette.accent',
              value: '#ffaa1c',
              sourceRef: null,
            },
          ],
          exemplars: [],
          provenance: 'inferred',
          confidence: 0.6,
          enabled: true,
          editedAt: null,
        },
        {
          section: 'voice',
          title: 'Voice',
          summary: '',
          content: {},
          rules: [
            {
              statement: 'Never write in the first person plural.',
              strength: 'hard',
              target: null,
              value: null,
              sourceRef: null,
            },
          ],
          exemplars: [],
          provenance: 'declared',
          confidence: 1,
          enabled: true,
          editedAt: null,
        },
      ],
    });

  it('names a checker only when one actually runs the rule', () => {
    const inert = ledger(base.adherence);
    expect(inert.rules).toHaveLength(1);
    expect(inert.rules[0]?.enforcedBy).toBeNull();
    expect(inert.rules[0]?.measurement).toContain('artDirection.palette.accent');
    expect(inert.rules[0]?.severity).toBe('blocking');
    expect(inert.rules[0]?.learned).toBe(true);

    const wired = ledger({ ...base.adherence, forbidRawHex: true });
    expect(wired.rules[0]?.enforcedBy).toContain('lintAgainstAdherence (raw-hex)');
  });

  it('files an unmeasurable complaint with its reason rather than inventing a threshold', () => {
    const result = ledger(base.adherence);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]?.reported).toBe('Never write in the first person plural.');
    expect(result.pending[0]?.whyNotMeasurable).toContain('not observable on a rendered pixel');
    // The marker prefix is the contract's convention and must not survive into the UI.
    expect(result.pending[0]?.whyNotMeasurable).not.toContain('not measurable yet');
  });
});
