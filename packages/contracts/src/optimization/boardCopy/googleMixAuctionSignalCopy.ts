// The board's Google lenses G05 Mix, G06 Auction and G10 Signal, in the account's language. Two
// things live here, because the optimizer surface ships English chrome only (its vocabulary guard):
//
//  · Each lens's takeaway: one sentence built from figures the lens already printed (shares,
//    money, counts), so it can never disagree with the figure drawn beside it. Every account the
//    board serves today is Mexican, so the sentence is Spanish, as readAdAccount's reasons are.
//  · The words the engine's P8 findings (accountDetectors.ts) state their figures under. The
//    engine writes them in English until its Spanish rewrite deploys (decision 3) and in Spanish
//    after, so every label lists both and a lens reads whichever the card carries. A lens reads
//    a card by its stable keys first (idea, bars, flags, numbers); these words cover only the
//    figures a finding states in its facts alone.

// ── P8 vocabulary, English and Spanish ─────────────────────────────────────────────────────

/** E1 (continuity_calendar): the conversions its dark days cost at the served-day average. */
export const auctionFindingLabels = {
  lostConversions: [
    'Conversions lost (served-day average)',
    'Conversiones perdidas (promedio de los días con anuncios)',
  ],
} as const;

/** V1 (inflated_primary_conversion), E3 (conversion_value_map) and P5 (lead_to_sale_funnel). */
export const signalFindingLabels = {
  /** V1: every conversion Google reports, primary actions together. */
  reported: ['Conversions Google reports', 'Conversiones que Google reporta'],
  reportedCost: ['Reported cost per conversion', 'Costo por conversión reportado'],
  realCost: ['Real cost per result', 'Costo real por resultado'],
  /** E3: the primary actions, named and comma-separated. */
  primaries: ['Primary today', 'Principales hoy'],
  /** P5: "1 · $737 MXN", the sales and what they were worth. */
  sales: ['Sales', 'Ventas'],
  roas: ['ROAS'],
} as const;

/** The words inside one E3 action's figure: "3470 · secondary · value 1", or after the rewrite
 *  "3470 · secundaria · valor 1". */
export const signalActionWords = {
  primary: ['primary', 'principal'],
  secondary: ['secondary', 'secundaria'],
  valuePrefix: ['value ', 'valor '],
  /** An action with no value set. */
  unset: ['not set', 'sin definir'],
  /** The primaries fact when no action is primary. */
  noPrimary: ['none', 'ninguna'],
  /** E3's checklist detail when every action carries the same value. */
  sameValue: ['Today they are all valued the same', 'Hoy todas tienen el mismo valor'],
} as const;

// ── Words and dates ─────────────────────────────────────────────────────────────────────────

/** "26 oct" */
function day(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "26 oct", "15–19 oct", "28 oct – 2 nov" */
function dayRun(from: string, to: string): string {
  if (from === to) return day(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${day(to)}`;
  return `${day(from)} – ${day(to)}`;
}

/** "a", "a y b", "a, b y c" */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function days(count: number): string {
  return `${count} ${count === 1 ? 'día' : 'días'}`;
}

/** A count as printed, with the noun that agrees with the figure shown. */
export type SignalCopyCount = { count: number; text: string };

function counted(figure: SignalCopyCount, one: string, many: string): string {
  return `${figure.text} ${Math.round(figure.count) === 1 ? one : many}`;
}

// ── G05 Mix ─────────────────────────────────────────────────────────────────────────────────

/** The result a split counts: the Google portfolios' goal, or plain conversions. */
export type MixCopyResult = 'leads' | 'purchases' | 'signups' | 'conversions';

const MIX_RESULT: Record<MixCopyResult, { one: string; many: string; the: 'los' | 'las' }> = {
  leads: { one: 'lead', many: 'leads', the: 'los' },
  purchases: { one: 'compra', many: 'compras', the: 'las' },
  signups: { one: 'registro', many: 'registros', the: 'los' },
  conversions: { one: 'conversión', many: 'conversiones', the: 'las' },
};

/** One part of the split as its row prints it. */
export type MixCopyPart = {
  label: string;
  /** "62%" */
  spendShare: string;
  /** "8%"; null when the results are not counted. */
  resultShare: string | null;
  /** "$502 MXN"; null when a result cannot be priced. */
  cost: string | null;
};

/**
 * "Search lleva 62% del gasto y trae 8% de los leads ($502 MXN por lead); Performance Max lleva
 * 38% y trae 92% ($27.18 MXN por lead)." The lead part, then the part that leans the other way.
 * Without results: "Search lleva 83% del gasto; Performance Max, 17%."
 */
export function mixSplitSentence(
  lead: MixCopyPart,
  counterpart: MixCopyPart | null,
  result: MixCopyResult,
): string {
  const words = MIX_RESULT[result];
  const cost = (part: MixCopyPart) => (part.cost ? ` (${part.cost} por ${words.one})` : '');
  if (lead.resultShare == null) {
    const tail = counterpart ? `; ${counterpart.label}, ${counterpart.spendShare}` : '';
    return `${lead.label} lleva ${lead.spendShare} del gasto${tail}.`;
  }
  const first = `${lead.label} lleva ${lead.spendShare} del gasto y trae ${lead.resultShare} de ${words.the} ${words.many}${cost(lead)}`;
  if (!counterpart || counterpart.resultShare == null) return `${first}.`;
  return `${first}; ${counterpart.label} lleva ${counterpart.spendShare} y trae ${counterpart.resultShare}${cost(counterpart)}.`;
}

/** One course line against the share agreed with the client, as printed. */
export type MixCopyLine = { label: string; share: string; agreed: string };

/** "ISO lleva 44% del gasto contra 40% acordado; COBIT · BRM · IA · eventos, 17% contra 20%." */
export function mixLineSentence(lines: readonly MixCopyLine[]): string | null {
  if (lines.length === 0) return null;
  const parts = lines.map((line, index) =>
    index === 0
      ? `${line.label} lleva ${line.share} del gasto contra ${line.agreed} acordado`
      : `${line.label}, ${line.share} contra ${line.agreed}`,
  );
  return `${parts.join('; ')}.`;
}

// ── G06 Auction ─────────────────────────────────────────────────────────────────────────────

/** A campaign and the share of its impressions it loses, printed ("74%"). */
export type AuctionCopyLoss = { campaign: string; share: string };

/**
 * "VIVO 47-EKATAR pierde 74% de sus impresiones por presupuesto: subir el presupuesto espera la
 * corrección de la conversión; SALES-PMAX-OCTUBRE pierde 78% por ranking, que el presupuesto no
 * recupera." The campaign that loses most to budget (and that its raise waits, when V3 locks it),
 * then the one that loses more to rank than budget can buy back. Null with neither.
 */
export function auctionSharesSentence(
  budget: (AuctionCopyLoss & { locked: boolean }) | null,
  rank: AuctionCopyLoss | null,
): string | null {
  const parts: string[] = [];
  if (budget) {
    parts.push(
      `${budget.campaign} pierde ${budget.share} de sus impresiones por presupuesto${budget.locked ? ': subir el presupuesto espera la corrección de la conversión' : ''}`,
    );
  }
  if (rank)
    parts.push(`${rank.campaign} pierde ${rank.share} por ranking, que el presupuesto no recupera`);
  return parts.length > 0 ? `${parts.join('; ')}.` : null;
}

export type AuctionCopyDark = {
  /** Google's account card: suspended, or not delivering. Null when E1 alone puts the lens
   *  here (the account served again). */
  status: 'suspended' | 'not_delivering' | null;
  darkDays: number;
  /** The first day of the account card's dark run, ISO; null when the card does not date it. */
  darkSince: string | null;
  /** The budget per day waiting, printed ("$670 MXN"). */
  budgetPerDay: string | null;
  /** E1's dark runs, ISO days. */
  runs: readonly { from: string; to: string }[];
  /** E1's estimate of the conversions the dark days cost, printed ("409"). */
  lostConversions: string | null;
};

/**
 * "Google suspendió la cuenta: sin anuncios desde el 26 oct (5 días), con $670 MXN al día de
 * presupuesto esperando." With E1 alone: "La cuenta no mostró anuncios 11 días (15–19 oct y
 * 26–31 oct): unas 409 conversiones perdidas al promedio de los días servidos."
 */
export function auctionDarkSentence(dark: AuctionCopyDark): string {
  if (dark.status) {
    const since = dark.darkSince ? ` desde el ${day(dark.darkSince)}` : '';
    const span = `(${days(dark.darkDays)})`;
    if (dark.status === 'suspended') {
      const waiting = dark.budgetPerDay
        ? `, con ${dark.budgetPerDay} al día de presupuesto esperando`
        : '';
      return `Google suspendió la cuenta: sin anuncios${since} ${span}${waiting}.`;
    }
    return `Google no muestra los anuncios de la cuenta${since} ${span}.`;
  }
  const runs = list(dark.runs.map((run) => dayRun(run.from, run.to)));
  const lost = dark.lostConversions
    ? `: unas ${dark.lostConversions} conversiones perdidas al promedio de los días servidos`
    : '';
  return `La cuenta no mostró anuncios ${days(dark.darkDays)}${runs ? ` (${runs})` : ''}${lost}.`;
}

// ── G10 Signal ──────────────────────────────────────────────────────────────────────────────

export type SignalCopySplit = {
  /** "4,051"; null when the finding does not say. */
  reported: string | null;
  /** "3,461" */
  attention: string;
  /** "85%" */
  share: string;
  /** "592" */
  real: string;
  /** "$69.08 MXN"; null when not priced. */
  realCost: string | null;
  reportedCost: string | null;
};

/**
 * "Google reporta 4,051 conversiones, pero 3,461 (85%) son eventos de atención: cada resultado
 * real cuesta $69.08 MXN, no $10.09 MXN."
 */
export function signalSplitSentence(split: SignalCopySplit): string {
  const attention = `${split.attention} (${split.share}) son eventos de atención`;
  const head = split.reported
    ? `Google reporta ${split.reported} conversiones, pero ${attention}`
    : `De lo que Google reporta, ${attention}`;
  if (split.realCost && split.reportedCost) {
    return `${head}: cada resultado real cuesta ${split.realCost}, no ${split.reportedCost}.`;
  }
  return `${head}; los resultados reales son ${split.real}.`;
}

export type SignalCopyFunnel = {
  /** Null when the finding read no clicks. */
  clicks: SignalCopyCount | null;
  leads: SignalCopyCount;
  sales: SignalCopyCount;
  /** "$737 MXN" */
  salesValue: string | null;
  /** "0.08" */
  roas: string | null;
};

/** "1,608 clics dieron 11 leads y 1 venta de $737 MXN: ROAS 0.08." */
export function signalFunnelSentence(funnel: SignalCopyFunnel): string {
  const value = funnel.salesValue ? ` de ${funnel.salesValue}` : '';
  const roas = funnel.roas ? `: ROAS ${funnel.roas}` : '';
  const sold = `${counted(funnel.sales, 'venta', 'ventas')}${value}${roas}`;
  const leads = counted(funnel.leads, 'lead', 'leads');
  return funnel.clicks
    ? `${counted(funnel.clicks, 'clic', 'clics')} dieron ${leads} y ${sold}.`
    : `${leads} dieron ${sold}.`;
}

export type SignalCopyActions = {
  count: number;
  /** The one value every action carries, printed; null when they differ. */
  sameValue: string | null;
  primaries: readonly string[];
  /** The actions the finding flags. */
  flagged: number;
};

/**
 * "Las 5 acciones de conversión valen 1; la principal hoy es Lead formulario web." Null when the
 * values differ and the finding flags no action.
 */
export function signalActionsSentence(actions: SignalCopyActions): string | null {
  const { count, primaries } = actions;
  const primary =
    primaries.length === 1
      ? `; la principal hoy es ${primaries[0]}`
      : primaries.length === count
        ? `, y las ${count} son principales`
        : primaries.length > 1
          ? `; ${primaries.length} son principales`
          : '';
  if (actions.sameValue != null) {
    return `Las ${count} acciones de conversión valen ${actions.sameValue}${primary}.`;
  }
  if (actions.flagged === 0) return null;
  return `El Optimizer marca ${actions.flagged} de las ${count} acciones de conversión${primary}.`;
}
