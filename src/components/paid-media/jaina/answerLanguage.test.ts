import { describe, expect, it } from 'bun:test';
import { answerLanguage, readsAsSpanish, SECTION_LABELS } from './answerLanguage';

const SPANISH =
  'Tus campañas mantuvieron un desempeño global rentable durante esta semana, sosteniendo conversiones comerciales consistentes.';
const SPANISH_UNACCENTED =
  'Pausar el anuncio Copy 3: cada conversacion le cuesta 54.84 MXN por semana.';
const ENGLISH =
  'Your campaigns held a profitable overall performance this week, with consistent commercial conversions for the account.';

describe('answerLanguage — the report says, else the sentence says', () => {
  it('takes a stated Spanish language over an English sentence', () => {
    expect(answerLanguage({ language: 'es', executive_summary: ENGLISH })).toBe('es');
    expect(answerLanguage({ language: 'es-MX', executive_summary: ENGLISH })).toBe('es');
    expect(answerLanguage({ language: 'Spanish', executive_summary: ENGLISH })).toBe('es');
  });

  it("reads the sentence when the language is the schema's own default", () => {
    // `checkpointReportV2Schema` fills `language: 'en'` in for a report that said nothing.
    expect(answerLanguage({ language: 'en', executive_summary: SPANISH })).toBe('es');
    expect(answerLanguage({ language: 'en', executive_summary: ENGLISH })).toBe('en');
  });

  it('reads the sentence when there is no language at all', () => {
    expect(answerLanguage({ executive_summary: SPANISH })).toBe('es');
    expect(answerLanguage({ language: null, executive_summary: SPANISH_UNACCENTED })).toBe('es');
    expect(answerLanguage({ executive_summary: ENGLISH })).toBe('en');
  });

  it('falls to English when nothing is stated and nothing is said', () => {
    expect(answerLanguage({})).toBe('en');
    expect(answerLanguage({ language: '', executive_summary: '' })).toBe('en');
  });

  it('treats a third language as English chrome rather than guessing', () => {
    expect(answerLanguage({ language: 'pt', executive_summary: SPANISH })).toBe('en');
  });
});

describe('readsAsSpanish — small and deterministic', () => {
  it('settles on an accent, an ñ or an inverted mark alone', () => {
    expect(readsAsSpanish('¿Qué pausar?')).toBe(true);
    expect(readsAsSpanish('Campañas')).toBe(true);
  });

  it('needs two Spanish function words and more of them than English ones', () => {
    expect(readsAsSpanish(SPANISH_UNACCENTED)).toBe(true);
    expect(readsAsSpanish('the spend of the account')).toBe(false);
    expect(readsAsSpanish('el ROAS')).toBe(false);
  });

  it('is not fooled by a shared word', () => {
    // "Copy 3" and a currency code carry no language.
    expect(readsAsSpanish('Copy 3 · 54.84 MXN')).toBe(false);
  });
});

describe('SECTION_LABELS', () => {
  it('names the three strata in each language', () => {
    expect(SECTION_LABELS.es).toEqual({
      why: 'Por qué',
      action: 'Acción',
      evidence: 'Evidencia',
      evidenceDetail: 'Los datos detrás de la respuesta',
    });
    expect(SECTION_LABELS.en).toEqual({
      why: 'Why',
      action: 'Action',
      evidence: 'Evidence',
      evidenceDetail: 'The data behind the answer',
    });
  });
});
