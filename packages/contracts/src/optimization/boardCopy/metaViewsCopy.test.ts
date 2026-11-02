import { describe, expect, it } from 'bun:test';
import {
  branchKindTokens,
  branchMonthTokens,
  metaBranchesNoResultSentence,
  metaBranchesSingleSentence,
  metaBranchesSpreadSentence,
  metaDay,
  metaEventsGoalSentence,
  metaEventsLostSentence,
  metaEventsNoValueSentence,
  metaEventsValuedSentence,
  metaHeadroomEmptySentence,
  metaHeadroomSentence,
  metaStructureSentence,
} from './metaViewsCopy';

// Figures from Easy Fit's Meta account, Oct 3 – Nov 2 2026, as the views print them.

describe('the Branches takeaway', () => {
  it('names the cheapest and the dearest branch against the goal', () => {
    expect(
      metaBranchesSpreadSentence(
        'purchases',
        { label: 'EASY', cost: '$305 MXN' },
        { label: 'ITESO', cost: '$485 MXN' },
        { kind: 'goal', money: '$296 MXN' },
      ),
    ).toBe('EASY consigue compras a $305 MXN y ITESO a $485 MXN; la meta es $296 MXN.');
  });

  it('reads against the account average without a goal, and with one row priced', () => {
    expect(
      metaBranchesSingleSentence(
        'conversations',
        { label: 'AV CAMACHO', cost: '$44.18 MXN', resultShare: '24%' },
        { kind: 'average', money: '$49.96 MXN' },
      ),
    ).toBe(
      'AV CAMACHO trae el 24% de las conversaciones, a $44.18 MXN; el promedio de la cuenta es $49.96 MXN.',
    );
    expect(
      metaBranchesSingleSentence(
        'leads',
        { label: 'EASY', cost: '$611 MXN', resultShare: '88%' },
        null,
      ),
    ).toBe('EASY trae el 88% de los leads, a $611 MXN.');
  });

  it('says when nothing was counted, or nothing spent', () => {
    expect(metaBranchesNoResultSentence({ label: 'CAÑADAS', spendShare: '27%' })).toBe(
      'Sin resultados en 30 días: CAÑADAS se lleva el 27% del gasto.',
    );
    expect(metaBranchesNoResultSentence(null)).toBe('Ninguna campaña gastó en 30 días.');
  });
});

describe('the Delivery headroom takeaway', () => {
  it('names the cheapest to reach and the best at converting', () => {
    expect(
      metaHeadroomSentence(
        'purchases',
        { label: 'ALEIRA', cpm: '$43.35 MXN' },
        { label: 'EASY', cost: '$305 MXN' },
      ),
    ).toBe(
      'ALEIRA tiene el CPM más bajo ($43.35 MXN) y EASY el mejor costo por compra ($305 MXN).',
    );
    expect(
      metaHeadroomSentence(
        'purchases',
        { label: 'ALEIRA', cpm: '$43.40 MXN' },
        { label: 'ALEIRA', cost: '$331 MXN' },
      ),
    ).toBe(
      'ALEIRA tiene el CPM más bajo ($43.40 MXN) y también el mejor costo por compra ($331 MXN).',
    );
    expect(metaHeadroomEmptySentence(null)).toBe('Sin resultados que ubicar en 30 días.');
  });
});

describe('the Optimization events takeaway', () => {
  it('prices the valued event, or names the lost roster, or the goal', () => {
    expect(metaEventsValuedSentence('purchases', '$498 MXN', '$406 MXN', '1.23')).toBe(
      'Cada compra vale $498 MXN en promedio y cuesta $406 MXN: ROAS 1.23 en 30 días.',
    );
    expect(
      metaEventsLostSentence('Tours Programados - Octubre', 3, '2026-10-15T16:58:32.02+00:00'),
    ).toBe(
      'Tours Programados - Octubre perdió sus 3 conjuntos el 15 oct: su evento ya no tiene entrega.',
    );
    expect(metaEventsGoalSentence('Conversaciones Whatsapp', 'conversations', '$45.00 MXN')).toBe(
      'Conversaciones Whatsapp optimiza conversaciones con una meta de $45.00 MXN.',
    );
    expect(metaEventsNoValueSentence()).toBe('Ningún evento de esta cuenta trae valor en 30 días.');
  });
});

describe('the Account structure takeaway', () => {
  const lost = {
    count: 3,
    portfolio: 'Tours Programados - Octubre',
    since: '2026-10-15T16:58:32.02+00:00',
  };

  it('says how much of the spend the portfolios hold, and what was lost', () => {
    expect(
      metaStructureSentence({ managedShare: '80%', noneManaged: false, top: null, lost }),
    ).toBe(
      'Los portafolios manejan el 80% del gasto de 30 días; 3 conjuntos de Tours Programados - Octubre se perdieron el 15 oct.',
    );
    expect(
      metaStructureSentence({
        managedShare: '0%',
        noneManaged: true,
        top: null,
        lost: { ...lost, count: 1 },
      }),
    ).toBe(
      'Ningún portafolio maneja los conjuntos que gastaron en 30 días; 1 conjunto de Tours Programados - Octubre se perdió el 15 oct.',
    );
  });

  it('names the biggest campaign without the rosters', () => {
    expect(
      metaStructureSentence({
        managedShare: null,
        noneManaged: false,
        top: { label: 'CAÑADAS // MENSAJES //Octubre  2026', share: '26%' },
        lost: null,
      }),
    ).toBe('CAÑADAS // MENSAJES //Octubre  2026 concentra el 26% del gasto de 30 días.');
  });
});

describe('the campaign-name tokens', () => {
  it('are folded: upper case, no accents', () => {
    for (const token of [...branchMonthTokens, ...branchKindTokens]) {
      expect(token).toBe(token.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase());
    }
    expect(branchMonthTokens).toContain('OCTUBRE');
    expect(branchKindTokens).toContain('MENSAJES');
  });

  it('dates in the account’s language', () => {
    expect(metaDay('2026-10-15T16:58:32.02+00:00')).toBe('15 oct');
    expect(metaDay('not a date')).toBe('not a date');
  });
});
