// The board's Meta views (Branches, Delivery headroom, Optimization events, Account structure) in
// the account's language, and the tokens they read campaign names with. Two things live here,
// because the optimizer surface ships English chrome only (its vocabulary guard):
//
//  · Each view's takeaway: one sentence built from figures the view already printed (money,
//    shares, counts), passed in as text, so it can never disagree with the figure drawn beside
//    it. Every account the board serves today is Mexican, so the sentence is Spanish, as
//    readAdAccount's reasons are.
//  · The words a campaign name is read with: a month, a year, or a word for what the campaign
//    buys or how it is built ("OCTUBRE// ALEIRA // MENSAJES //  2026" is the branch ALEIRA).
//    Easy Fit writes them in Spanish; the English ones are here too, so an account that names its
//    campaigns in English reads the same way. Every token is folded: no accents, upper case.

// ── Campaign-name tokens ────────────────────────────────────────────────────────────────────

/** Month names and their abbreviations, Spanish and English, folded. */
export const branchMonthTokens: readonly string[] = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'SETIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'SEPT',
  'OCT',
  'NOV',
  'DIC',
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
  'JAN',
  'APR',
  'AUG',
  'DEC',
];

/** Words for what a campaign buys or how it is built, Spanish and English, folded. A segment
 *  made only of these (and dates) is the template a name was written from, never a branch. */
export const branchKindTokens: readonly string[] = [
  'MENSAJES',
  'MENSAJE',
  'MENSAJERIA',
  'MESSAGES',
  'MESSAGE',
  'MESSAGING',
  'WHATSAPP',
  'WA',
  'MESSENGER',
  'DM',
  'INBOX',
  'FORMULARIO',
  'FORMULARIOS',
  'FORM',
  'FORMS',
  'LEAD',
  'LEADS',
  'LEADGEN',
  'CLIENTES',
  'POTENCIALES',
  'REGISTRO',
  'REGISTROS',
  'SIGNUP',
  'SIGNUPS',
  'TOUR',
  'TOURS',
  'CITA',
  'CITAS',
  'VENTA',
  'VENTAS',
  'SALE',
  'SALES',
  'CONVERSION',
  'CONVERSIONES',
  'CONVERSIONS',
  'COMPRA',
  'COMPRAS',
  'PURCHASE',
  'PURCHASES',
  'CATALOGO',
  'CATALOG',
  'DPA',
  'TRAFICO',
  'TRAFFIC',
  'CLICS',
  'CLICKS',
  'ALCANCE',
  'REACH',
  'RECONOCIMIENTO',
  'AWARENESS',
  'INTERACCION',
  'INTERACCIONES',
  'ENGAGEMENT',
  'VIDEO',
  'VIDEOS',
  'REPRODUCCIONES',
  'THRUPLAY',
  'THRUPLAYS',
  'APP',
  'INSTALL',
  'INSTALLS',
  'INSTALACIONES',
  'ADVANTAGE',
  'ADV',
  'ASC',
  'CBO',
  'ABO',
  'BAU',
  'BROAD',
  'LKL',
  'LAL',
  'LOOKALIKE',
  'INTERESES',
  'INTERESTS',
  'RMKT',
  'REMARKETING',
  'RETARGETING',
  'PROSPECTING',
  'PROSPECCION',
  'TOF',
  'MOF',
  'BOF',
  'TOFU',
  'MOFU',
  'BOFU',
  'CONTINUUM',
  'COPY',
  'COPIA',
  'DUPLICADO',
  'DUPLICATE',
  'TEST',
  'TESTING',
  'PRUEBA',
  'PRUEBAS',
  'NUEVA',
  'NUEVO',
  'NEW',
];

// ── Words and dates ─────────────────────────────────────────────────────────────────────────

/** The results a Meta view counts. */
export type MetaCopyResult = 'purchases' | 'leads' | 'conversations';

/** The word for one result and for many, in the account's language. */
export const metaResultWords: Record<MetaCopyResult, { one: string; many: string }> = {
  purchases: { one: 'compra', many: 'compras' },
  leads: { one: 'lead', many: 'leads' },
  conversations: { one: 'conversación', many: 'conversaciones' },
};

/** "15 oct", from an ISO instant, in UTC. */
export function metaDay(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

/** What a cost is read against, printed: the goal, or the account's own average. */
export type MetaCopyReference = { kind: 'goal' | 'average'; money: string };

function referenceClause(reference: MetaCopyReference | null): string {
  if (!reference) return '';
  return reference.kind === 'goal'
    ? `; la meta es ${reference.money}`
    : `; el promedio de la cuenta es ${reference.money}`;
}

// ── Branches ────────────────────────────────────────────────────────────────────────────────

/** A branch (or campaign) and its cost per result, printed. */
export type MetaCopyCost = { label: string; cost: string };

/** "EASY consigue compras a $305 MXN y ITESO a $485 MXN; la meta es $296 MXN." */
export function metaBranchesSpreadSentence(
  result: MetaCopyResult,
  best: MetaCopyCost,
  worst: MetaCopyCost,
  reference: MetaCopyReference | null,
): string {
  return `${best.label} consigue ${metaResultWords[result].many} a ${best.cost} y ${worst.label} a ${worst.cost}${referenceClause(reference)}.`;
}

/** "EASY trae el 13% de las compras, a $305 MXN; la meta es $296 MXN." One row priced. */
export function metaBranchesSingleSentence(
  result: MetaCopyResult,
  best: MetaCopyCost & { resultShare: string },
  reference: MetaCopyReference | null,
): string {
  const words = metaResultWords[result];
  const the = result === 'purchases' || result === 'conversations' ? 'las' : 'los';
  return `${best.label} trae el ${best.resultShare} de ${the} ${words.many}, a ${best.cost}${referenceClause(reference)}.`;
}

/** "Sin resultados en 30 días: CAÑADAS se lleva el 27% del gasto." With nothing spent: "Ninguna
 *  campaña gastó en 30 días." */
export function metaBranchesNoResultSentence(
  top: { label: string; spendShare: string } | null,
): string {
  return top
    ? `Sin resultados en 30 días: ${top.label} se lleva el ${top.spendShare} del gasto.`
    : 'Ninguna campaña gastó en 30 días.';
}

// ── Delivery headroom ───────────────────────────────────────────────────────────────────────

/**
 * "ALEIRA tiene el CPM más bajo ($43.35 MXN) y EASY el mejor costo por compra ($305 MXN)." When
 * one branch leads both: "ALEIRA tiene el CPM más bajo ($43.35 MXN) y también el mejor costo por
 * compra ($331 MXN)."
 */
export function metaHeadroomSentence(
  result: MetaCopyResult | null,
  cheapest: { label: string; cpm: string },
  best: { label: string; cost: string },
): string {
  const one = result ? metaResultWords[result].one : 'resultado';
  if (cheapest.label === best.label) {
    return `${cheapest.label} tiene el CPM más bajo (${cheapest.cpm}) y también el mejor costo por ${one} (${best.cost}).`;
  }
  return `${cheapest.label} tiene el CPM más bajo (${cheapest.cpm}) y ${best.label} el mejor costo por ${one} (${best.cost}).`;
}

/** "Sin compras que ubicar en 30 días." */
export function metaHeadroomEmptySentence(result: MetaCopyResult | null): string {
  return `Sin ${result ? metaResultWords[result].many : 'resultados'} que ubicar en 30 días.`;
}

// ── Optimization events ─────────────────────────────────────────────────────────────────────

/** "Cada compra vale $498 MXN en promedio y cuesta $406 MXN: ROAS 1.23 en 30 días." */
export function metaEventsValuedSentence(
  result: MetaCopyResult,
  value: string,
  cost: string,
  roas: string,
): string {
  return `Cada ${metaResultWords[result].one} vale ${value} en promedio y cuesta ${cost}: ROAS ${roas} en 30 días.`;
}

/** "Tours Programados - Octubre perdió sus 3 conjuntos el 15 oct: su evento ya no tiene
 *  entrega." `since` is an ISO instant. */
export function metaEventsLostSentence(
  portfolio: string,
  count: number | null,
  since: string | null,
): string {
  const what = count != null ? `sus ${count} conjuntos` : 'sus conjuntos';
  return `${portfolio} perdió ${what}${since ? ` el ${metaDay(since)}` : ''}: su evento ya no tiene entrega.`;
}

/** "Conversaciones Whatsapp optimiza conversaciones con una meta de $45.00 MXN." */
export function metaEventsGoalSentence(
  portfolio: string,
  result: MetaCopyResult,
  goal: string,
): string {
  return `${portfolio} optimiza ${metaResultWords[result].many} con una meta de ${goal}.`;
}

/** No event on the account carries a value. */
export function metaEventsNoValueSentence(): string {
  return 'Ningún evento de esta cuenta trae valor en 30 días.';
}

// ── Account structure ───────────────────────────────────────────────────────────────────────

/** The ad sets a portfolio holds that Meta stopped serving. `since` is an ISO instant. */
export type MetaCopyLost = { count: number; portfolio: string; since: string | null };

/**
 * "Los portafolios manejan el 80% del gasto de 30 días; 3 conjuntos de Tours Programados - Octubre
 * se perdieron el 15 oct." `managedShare` is printed ("80%"), "0" when no portfolio holds an ad set
 * that spent, and null without the rosters: the sentence then names the biggest campaign.
 */
export function metaStructureSentence(input: {
  managedShare: string | null;
  noneManaged: boolean;
  top: { label: string; share: string } | null;
  lost: MetaCopyLost | null;
}): string {
  const { lost } = input;
  const lostClause = lost
    ? `; ${lost.count} ${lost.count === 1 ? 'conjunto' : 'conjuntos'} de ${lost.portfolio} se ${lost.count === 1 ? 'perdió' : 'perdieron'}${lost.since ? ` el ${metaDay(lost.since)}` : ''}`
    : '';
  if (input.managedShare != null) {
    return input.noneManaged
      ? `Ningún portafolio maneja los conjuntos que gastaron en 30 días${lostClause}.`
      : `Los portafolios manejan el ${input.managedShare} del gasto de 30 días${lostClause}.`;
  }
  return input.top
    ? `${input.top.label} concentra el ${input.top.share} del gasto de 30 días.`
    : 'Ninguna campaña gastó en 30 días.';
}
