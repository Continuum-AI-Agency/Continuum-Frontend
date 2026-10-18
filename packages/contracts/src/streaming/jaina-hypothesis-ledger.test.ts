import { describe, expect, it } from 'bun:test';
import {
  closeHypothesis,
  jainaHypothesisEntrySchema,
  jainaHypothesisLedgerSchema,
  ledgerIsTerminal,
  openHypothesisLedger,
} from './jaina-hypothesis-ledger';
import { JAINA_HYPOTHESES } from './jaina-question-plan';

const opened = () =>
  openHypothesisLedger({
    entity: { level: 'account', id: 'act_1', name: null },
    current_window: { since: '2026-10-09', until: '2026-10-15' },
    prior_window: { since: '2026-10-02', until: '2026-10-08' },
  });

describe('the hypothesis ledger', () => {
  it('refuses duplicate entries and cannot close a hypothesis on stale windows', () => {
    const ledger = opened();
    expect(
      jainaHypothesisLedgerSchema.safeParse({ entries: [ledger.entries[0], ledger.entries[0]] })
        .success,
    ).toBe(false);
    const stale = {
      ...ledger.entries[0]!,
      status: 'waived' as const,
      waiver_reason: 'The source was unavailable.',
      current_window: { since: '2026-10-01', until: '2026-10-07' },
    };
    expect(closeHypothesis(ledger, stale)).toEqual(ledger);
  });
  it('opens every hypothesis on one entity and both windows, and survives a JSON round trip', () => {
    const ledger = opened();
    expect(ledger.entries.map((entry) => entry.hypothesis)).toEqual([...JAINA_HYPOTHESES]);
    expect(ledgerIsTerminal(ledger)).toBe(false);
    expect(jainaHypothesisLedgerSchema.parse(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
  });

  it('refuses a waiver without its reason', () => {
    const [cpm] = opened().entries;
    expect(() =>
      closeHypothesis(opened(), { ...cpm!, status: 'waived', waiver_reason: '  ' }),
    ).toThrow();
  });

  it('refuses a verdict that names no dataset, or a closed hypothesis with no verdict', () => {
    const [entry] = opened().entries;
    expect(
      jainaHypothesisEntrySchema.safeParse({ ...entry, status: 'confirmed', verdict: 'CPM rose' })
        .success,
    ).toBe(false);
    expect(
      jainaHypothesisEntrySchema.safeParse({
        ...entry,
        status: 'rejected',
        evidence: [{ dataset_id: 'ds_1', tool: 'get_key_metrics' }],
      }).success,
    ).toBe(false);
  });

  it('is terminal only when every entry is confirmed, rejected or waived', () => {
    let ledger = opened();
    for (const entry of ledger.entries) {
      ledger = closeHypothesis(
        ledger,
        entry.hypothesis === 'recent_edit'
          ? { ...entry, status: 'waived', waiver_reason: 'the change log could not be read' }
          : {
              ...entry,
              status: 'rejected',
              verdict: `${entry.hypothesis} did not move`,
              figure: '10 in both windows',
              evidence: [{ dataset_id: 'ds_1', tool: 'get_key_metrics' }],
            },
      );
      expect(ledgerIsTerminal(ledger)).toBe(entry.hypothesis === JAINA_HYPOTHESES.at(-1));
    }
  });
});
