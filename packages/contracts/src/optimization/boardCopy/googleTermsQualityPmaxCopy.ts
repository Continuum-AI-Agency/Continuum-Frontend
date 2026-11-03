// The takeaway sentences of the board's Search terms, Quality Score and Performance Max lenses
// (G07–G09): one sentence each lens's figures add up to, in the account's language. Every account
// the board serves today is Mexican, so the copy is Spanish, as readAdAccount's reasons are.
//
// Each function takes its figures already printed by the lens (money, shares, multiples) and
// formats nothing, so the sentence can never disagree with the figure drawn beside it.

// ── Search terms (G07) ─────────────────────────────────────────────────────────────────────

export type TermsLensTakeawayFigure = {
  bucket: 'brand' | 'competitor' | 'wrong_intent';
  /** "54%" */
  share: string;
  /** "$13,353 MXN" */
  money: string;
  /** Whether any of the bucket's terms brought a conversion. */
  converted: boolean;
};

type TermsPhrase = (figure: TermsLensTakeawayFigure) => string;

const TERMS_LEAD: Record<TermsLensTakeawayFigure['bucket'], TermsPhrase> = {
  brand: (f) => `La marca se lleva el ${f.share} del gasto en términos (${f.money})`,
  wrong_intent: (f) =>
    `El ${f.share} del gasto en términos (${f.money}) fue a búsquedas sin intención de compra${f.converted ? '' : ', sin una sola conversión'}`,
  competitor: (f) =>
    `Las búsquedas de la competencia gastaron ${f.money}, el ${f.share} del gasto en términos${f.converted ? '' : ', sin una conversión'}`,
};

const TERMS_ALSO: Record<TermsLensTakeawayFigure['bucket'], TermsPhrase> = {
  brand: (f) => `la marca, el ${f.share} (${f.money})`,
  wrong_intent: (f) =>
    `sin intención de compra, el ${f.share} (${f.money})${f.converted ? '' : ' sin conversiones'}`,
  competitor: (f) => `la competencia, ${f.money}${f.converted ? '' : ' sin conversiones'}`,
};

/** The lead bucket's sentence, with the next flagged bucket as a second clause. */
export function termsLensTakeaway(
  lead: TermsLensTakeawayFigure,
  also: TermsLensTakeawayFigure | null = null,
): string {
  return `${TERMS_LEAD[lead.bucket](lead)}${also ? `; ${TERMS_ALSO[also.bucket](also)}` : ''}.`;
}

/** When no bucket passes its line: the total, and that nothing in it stands out. */
export function termsLensTakeawayQuiet(total: string): string {
  return `De ${total} en términos, ni la marca ni la competencia ni las búsquedas sin intención pasan su umbral.`;
}

// ── Quality Score (G08) ────────────────────────────────────────────────────────────────────

export type QualityLensTakeawayInput = {
  /** "29%" of the keyword spend at Quality Score ≤ 3. */
  share: string;
  /** "$4,323 MXN" */
  money: string;
  keywords: number;
  /** The component Google rates below average on most of that spend, with its share. */
  weakest: { component: 'expected_ctr' | 'ad_relevance' | 'landing_page'; share: string } | null;
};

const QUALITY_COMPONENT: Record<
  NonNullable<QualityLensTakeawayInput['weakest']>['component'],
  string
> = {
  expected_ctr: 'el CTR esperado',
  ad_relevance: 'la relevancia del anuncio',
  landing_page: 'la página de destino',
};

export function qualityLensTakeaway(input: QualityLensTakeawayInput): string {
  if (input.keywords === 0) {
    return 'Ninguna keyword con Quality Score de 3 o menos gastó en la ventana.';
  }
  const keywords = `${input.keywords} ${input.keywords === 1 ? 'keyword' : 'keywords'}`;
  const weakest = input.weakest
    ? `; ${QUALITY_COMPONENT[input.weakest.component]} está por debajo del promedio en el ${input.weakest.share} de ese gasto`
    : '';
  return `El ${input.share} del gasto en keywords (${input.money}, ${keywords}) está en Quality Score de 3 o menos${weakest}.`;
}

// ── Performance Max (G09) ──────────────────────────────────────────────────────────────────

export type PmaxLensTakeawayInput =
  | {
      kind: 'goal';
      name: string;
      /** "$3,283 MXN"; null when the campaign bought no conversion. */
      cost: string | null;
      spend: string;
      goal: string;
      position: 'over' | 'at' | 'under';
      /** "8.2×" over the goal, "41%" under it. */
      gap: string;
      /** "78%", when Google reports it. */
      lostToRank: string | null;
    }
  | { kind: 'no_goal'; share: string; cost: string | null }
  | {
      kind: 'winner';
      winner: string;
      winnerCost: string;
      comparator: string;
      comparatorCost: string;
      /** "3.7×" */
      ratio: string;
    };

export function pmaxLensTakeaway(input: PmaxLensTakeawayInput): string {
  switch (input.kind) {
    case 'winner':
      return `"${input.winner}" consigue cada conversión a ${input.winnerCost}; "${input.comparator}", a ${input.comparatorCost}: ${input.ratio} más cara.`;
    case 'no_goal':
      return `Performance Max se lleva el ${input.share} del gasto en Google${input.cost ? `, a ${input.cost} por conversión` : ', sin una conversión'}, y no tiene una meta contra la cual medirlo.`;
    case 'goal': {
      if (input.cost === null) {
        return `${input.name} gastó ${input.spend} sin una conversión; su meta es ${input.goal} por conversión.`;
      }
      const rank = input.lostToRank
        ? `, y pierde el ${input.lostToRank} de sus impresiones por ranking`
        : '';
      if (input.position === 'over') {
        return `${input.name} cuesta ${input.cost} por conversión: ${input.gap} su meta de ${input.goal}${rank}.`;
      }
      if (input.position === 'under') {
        return `${input.name} cuesta ${input.cost} por conversión, ${input.gap} por debajo de su meta de ${input.goal}.`;
      }
      return `${input.name} cuesta ${input.cost} por conversión, en su meta de ${input.goal}.`;
    }
  }
}
