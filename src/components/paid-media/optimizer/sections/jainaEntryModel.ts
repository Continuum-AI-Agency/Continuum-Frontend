// Contextual ways into Jaina from a portfolio: the analyses that apply to THIS
// portfolio, offered as the questions a person would ask rather than commands to
// memorise. Each label mirrors the first sentence of its prompt. Discovery
// through suggestion — a person learns what the product can do by seeing it offered
// where it is relevant.

import type { PortfolioListItem } from '@continuum/contracts';
import { humanize } from '../format';

export type JainaEntry = { key: string; label: string; prompt: string };

type JainaPortfolio = Pick<PortfolioListItem, 'name' | 'objective' | 'id'>;

/** "el portafolio del optimizer "X" (objetivo: Lead)" — the scope line every prompt opens with. */
function portfolioScope(portfolio: JainaPortfolio): string {
  return `el portafolio del optimizer "${portfolio.name}" (objetivo: ${humanize(portfolio.objective)})`;
}

// The portfolio is read in Spanish (Performance+ redesign, portafolio.html: the Jaina row),
// like the Overview, so its questions are Spanish too.
export function jainaEntryPrompts(portfolio: JainaPortfolio): JainaEntry[] {
  const who = portfolioScope(portfolio);
  return [
    {
      key: 'budget',
      label: '¿Dónde está el presupuesto?',
      prompt: `Para ${who}: ¿vamos a ritmo y dónde está el presupuesto? Lee el último ciclo del optimizer (ritmo, movimientos, retenidos) y dame la línea de alcance, una tabla por conjunto, el piso de contexto y las acciones.`,
    },
    {
      key: 'creative',
      label: '¿Qué creativos ganan?',
      prompt: `Para ${who}: ¿qué ángulos de comunicación ganan y cuáles se desgastan? Agrupa los anuncios activos por ángulo, muestra gasto, CTR, CVR, CPA y la clase de eficiencia por ángulo, luego las oportunidades de escalar / renovar / apagar y hasta tres briefs.`,
    },
    {
      key: 'funnel',
      label: '¿Dónde se pierde el embudo?',
      prompt: `Para ${who}: ¿dónde se pierde el embudo? Impresiones a clics a resultados por conjunto en los últimos 14 días contra los 14 previos y la base de 30 días, con la caída nombrada y medida.`,
    },
    {
      key: 'scaling',
      label: '¿Qué conjunto escalar?',
      prompt: `Para ${who}: ¿qué conjunto puede tomar más presupuesto sin perder eficiencia? Los conjuntos en o bajo el costo objetivo con margen, el tope de velocidad y los pisos que acotaron el último ciclo, y los ajustes que el optimizer recomienda cambiar.`,
    },
    {
      key: 'risks',
      label: 'Riesgos esta semana',
      prompt: `Para ${who}: ¿qué está por salir mal esta semana? Conjuntos bajo el piso de eventos, huecos de tracking, saturación de audiencia, fatiga creativa, problemas de entrega, cada uno con su evidencia y qué hacer.`,
    },
  ];
}

/**
 * A question typed into the portfolio's own field, sent to Jaina with the portfolio as its
 * context — the same scope line the prepared questions open with, so the answer is about
 * THIS portfolio and not the account.
 */
export function jainaAskPrompt(portfolio: JainaPortfolio, question: string): string {
  return `Para ${portfolioScope(portfolio)}: ${question.trim()}`;
}

// The account-level band. The Overview is read in Spanish, so its questions are Spanish
// too; each prompt names the account and every portfolio (name + objective) so Jaina has
// the whole scope in one line. Two questions are conditional: "why is X expensive" only
// exists when some portfolio is over its target, and "how is X doing" replaces the generic
// risks question when one portfolio is spending with nothing to show for it.

export type JainaAccountContext = {
  accountLabel: string | null;
  portfolios: Array<{ name: string; objective: string }>;
  /** the portfolio furthest over its target, if any */
  worstOverTarget: string | null;
  /** a portfolio spending with zero results, if any */
  noResults: string | null;
};

export function jainaAccountEntryPrompts(account: JainaAccountContext): JainaEntry[] {
  const accountName = account.accountLabel
    ? `la cuenta "${account.accountLabel}"`
    : 'la cuenta activa';
  const portfolioList =
    account.portfolios.length > 0
      ? account.portfolios
          .map((portfolio) => `"${portfolio.name}" (objetivo: ${humanize(portfolio.objective)})`)
          .join(', ')
      : 'ninguno activo';
  const who = `${accountName}, con los portafolios del optimizer: ${portfolioList}`;
  const scopeAndActions =
    'Dame la línea de alcance, una tabla por portafolio y las acciones para esta semana.';

  const expensive: JainaEntry[] = account.worstOverTarget
    ? [
        {
          key: 'expensive',
          label: `¿Por qué ${account.worstOverTarget} está caro?`,
          prompt: `Para ${who}: ¿por qué "${account.worstOverTarget}" está caro? Es el portafolio más lejos por encima de su costo objetivo. Compara su costo por resultado de los últimos 7 días contra el objetivo y contra los 14 días previos, nombra los ad sets que empujan el costo con su evidencia, y dime qué cambiar. ${scopeAndActions}`,
        },
      ]
    : [];

  const silentOrRisks: JainaEntry = account.noResults
    ? {
        key: 'silent',
        label: `¿Cómo va ${account.noResults}?`,
        prompt: `Para ${who}: ¿cómo va "${account.noResults}"? Está gastando sin resultados. Revisa la entrega, el tracking, la audiencia y los creativos de sus ad sets, di si el problema es de medición o de desempeño, y qué hacer hoy. ${scopeAndActions}`,
      }
    : {
        key: 'risks',
        label: '¿Qué está por salir mal?',
        prompt: `Para ${who}: ¿qué está por salir mal? En cada portafolio: ad sets bajo el piso de eventos, huecos de tracking, saturación de audiencia, fatiga creativa y problemas de entrega, cada uno con su evidencia. ${scopeAndActions}`,
      };

  return [
    ...expensive,
    {
      key: 'pause',
      label: '¿Qué pausar esta semana?',
      prompt: `Para ${who}: ¿qué pausar esta semana? Señala en cada portafolio los ad sets y anuncios que gastan sin resultados, con un costo muy por encima del objetivo o con fatiga creativa, con el gasto que libera cada pausa y el riesgo de hacerla. ${scopeAndActions}`,
    },
    silentOrRisks,
    {
      key: 'budget',
      label: '¿Dónde está el presupuesto?',
      prompt: `Para ${who}: ¿dónde está el presupuesto? Presupuesto diario y gasto real de cada portafolio, si vamos a ritmo, qué movió el optimizer en su último ciclo y qué quedó retenido. ${scopeAndActions}`,
    },
    {
      key: 'summary',
      label: 'Resumen para el cliente',
      prompt: `Para ${who}: escribe un resumen para el cliente. Qué pasó esta semana en cada portafolio (gasto, resultados y costo por resultado contra el objetivo), qué se cambió y por qué, y qué sigue. Tono claro y sin jerga, con una tabla por portafolio y tres puntos de acción al final.`,
    },
  ];
}
