// Contextual ways into Jaina from a portfolio: the analyses that apply to THIS
// portfolio, offered as the questions a person would ask rather than commands to
// memorise. Each label mirrors the first sentence of its prompt. Discovery
// through suggestion — a person learns what the product can do by seeing it offered
// where it is relevant.

import type { PortfolioListItem } from '@continuum/contracts';
import { humanize } from '../format';

export type JainaEntry = { key: string; label: string; prompt: string };

export function jainaEntryPrompts(
  portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'>,
): JainaEntry[] {
  const who = `the optimizer portfolio "${portfolio.name}" (objective: ${humanize(portfolio.objective)})`;
  return [
    {
      key: 'budget',
      label: 'Where is the money going?',
      prompt: `For ${who}: are we on pace, and where is the money going? Read the optimizer's latest cycle (pacing, moves, held items) and give me the scope line, a table by ad set, the context floor and the actions.`,
    },
    {
      key: 'creative',
      label: 'Which creatives are winning?',
      prompt: `For ${who}: which communication angles are winning and which are wearing out? Cluster the live ads into angles, show spend, CTR, CVR, CPA and the efficiency class per angle, then the scale / refresh / kill opportunities and up to three briefs.`,
    },
    {
      key: 'funnel',
      label: 'Where does the funnel leak?',
      prompt: `For ${who}: where does the funnel leak? Impressions to clicks to results by ad set over the last 14 days against the prior 14 and the 30-day baseline, with the drop-off named and sized.`,
    },
    {
      key: 'scaling',
      label: 'What could take more budget?',
      prompt: `For ${who}: what could take more budget without losing efficiency? Ad sets at or under the target cost with headroom, the velocity cap and floors that bound the last cycle, and the settings the optimizer recommends changing.`,
    },
    {
      key: 'risks',
      label: 'What is about to go wrong?',
      prompt: `For ${who}: what is about to go wrong? Ad sets under the event floor, tracking gaps, audience saturation, creative fatigue, delivery issues — each with its evidence and what to do this week.`,
    },
  ];
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
