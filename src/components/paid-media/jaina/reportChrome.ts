import type { AnswerLanguage } from './answerLanguage';
import { JUDGEMENT_LABEL, type Judgement, judgeDelta } from './reading';

/** First-party report accessibility chrome follows the answer, independently of account UI. */
export function reportSourceLabel(
  index: number,
  title: string,
  description: string | undefined,
  language: AnswerLanguage,
): string {
  const shown = new Intl.NumberFormat(language).format(index);
  return language === 'es'
    ? `Fuente ${shown}: ${title}${description ? ` — ${description}` : ''}`
    : `Source ${shown}: ${title}${description ? ` — ${description}` : ''}`;
}
export function reportReferenceLabel(
  label: string,
  value: string,
  right: boolean,
  language: AnswerLanguage,
): string {
  return language === 'es'
    ? `Línea de referencia ${label} ${value}${right ? ' en el eje derecho' : ''}`
    : `Reference line ${label} ${value}${right ? ' on the right axis' : ''}`;
}
export function reportMarkerLabel(
  label: string,
  category: string,
  language: AnswerLanguage,
): string {
  return language === 'es' ? `Marcador ${label} en ${category}` : `Marker ${label} at ${category}`;
}
export function reportSeriesLabel(index: number, language: AnswerLanguage): string {
  const shown = new Intl.NumberFormat(language).format(index);
  return language === 'es' ? `Serie ${shown}` : `Series ${shown}`;
}
export function reportColumnLabel(index: number, language: AnswerLanguage): string {
  const shown = new Intl.NumberFormat(language).format(index);
  return language === 'es' ? `Columna ${shown}` : `Column ${shown}`;
}

const SPANISH_JUDGEMENT: Record<Judgement, string> = {
  positive: 'bueno',
  risk: 'un problema',
  watch: 'requiere atención',
  neutral: 'normal',
  unjudged: 'sin evaluar',
};
export function reportJudgementLabel(judgement: Judgement, language: AnswerLanguage): string {
  return language === 'es' ? SPANISH_JUDGEMENT[judgement] : JUDGEMENT_LABEL[judgement];
}
export function reportDeltaPresentation(
  value: number,
  goodWhenDown: boolean,
  language: AnswerLanguage,
): { amount: string; ariaLabel: string } {
  const magnitude = Math.abs(Math.round(value));
  const amount = new Intl.NumberFormat(language).format(magnitude) + '%';
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  const movement =
    direction === 'neutral'
      ? language === 'es'
        ? 'Sin cambios'
        : 'No change'
      : language === 'es'
        ? `${direction === 'up' ? 'Sube' : 'Baja'} ${amount}`
        : `${direction === 'up' ? 'Up' : 'Down'} ${amount}`;
  const judgement = judgeDelta({ change: value, goodWhenDown });
  return {
    amount,
    ariaLabel:
      judgement === 'unjudged'
        ? movement
        : `${movement}, ${reportJudgementLabel(judgement, language)}`,
  };
}
