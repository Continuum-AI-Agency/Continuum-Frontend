// ---------------------------------------------------------------------------
// evaluateRules() — the generic condition-tree evaluator. Replaces the DCO's
// json-rules-engine dependency with ~150 lines of pure TS while keeping its
// wire format, so DB-stored rules stay portable. Differences from the DCO,
// all deliberate:
//   - synchronous & in-memory (facts come from AdSetSnapshot[], not SQL)
//   - unknown fact/operator is a LOUD per-evaluation error (the DCO ran with
//     allowUndefinedFacts:true and silently no-matched typos)
//   - dedup is pre-insert and per (adSetId, kind), higher priority wins
//     (the DCO deduped post-insert in SQL, lowest priority number won)
//   - built-in trigger precedence: matches on an (adSetId, kind) the native
//     P/F triggers already flagged are recorded as deduped, and pause/starve
//     (built-in or rule) suppresses fatigue-kind findings on the same ad set,
//     mirroring runCycle's skipIds contract.
//
// STATUS: UNWIRED STUB (see rules/types.ts).
// ---------------------------------------------------------------------------

import type { EngineConfig } from '../config';
import type { AdSetSnapshot } from '../types';
import { buildAdsetFacts, buildPortfolioFacts } from './facts';
import { OPERATORS, type ResolvedValue } from './operators';
import type {
  AlreadyFlagged,
  ConditionValue,
  FactMap,
  FactValue,
  RuleActionKind,
  RuleCondition,
  RuleDefinition,
  RuleEngineOutput,
  RuleEvaluation,
  RuleFinding,
} from './types';

const isFactRef = (v: unknown): v is { fact: string } =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as { fact?: unknown }).fact === 'string' &&
  Object.keys(v as object).length === 1;

function lookupFact(facts: FactMap, name: string): FactValue | undefined {
  if (!(name in facts)) {
    throw new Error(`unknown fact '${name}'`);
  }
  return facts[name];
}

function resolveValue(value: ConditionValue, facts: FactMap): ResolvedValue {
  if (isFactRef(value)) return lookupFact(facts, value.fact);
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object') {
    const resolved: Record<string, FactValue> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = isFactRef(v) ? lookupFact(facts, v.fact) : v;
      if (r !== undefined) resolved[k] = r;
    }
    return resolved;
  }
  return value;
}

/** Recursive condition evaluation. `all` of [] => true, `any` of [] => false
 *  (json-rules-engine conventions). Throws on unknown facts/operators. */
export function evalCondition(condition: RuleCondition, facts: FactMap): boolean {
  if ('all' in condition) {
    return condition.all.every((c) => evalCondition(c, facts));
  }
  if ('any' in condition) {
    return condition.any.some((c) => evalCondition(c, facts));
  }
  const op = OPERATORS[condition.operator];
  if (!op) throw new Error(`unknown operator '${condition.operator}'`);
  const factValue = lookupFact(facts, condition.fact);
  return op(factValue, resolveValue(condition.value, facts));
}

const formatFact = (v: FactValue | undefined): string => {
  if (v === undefined) return '?';
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return '∞';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

/** Fill `{{fact_name}}` placeholders in a reason template from the fact map. */
export function interpolateReason(template: string, facts: FactMap): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) =>
    formatFact(facts[name]),
  );
}

const FATIGUE_KINDS: RuleActionKind[] = ['creative_refresh', 'audience_expand'];

const isFindingKind = (k: RuleActionKind): k is RuleFinding['kind'] =>
  k === 'pause' || k === 'creative_refresh' || k === 'audience_expand';

type Match = {
  rule: RuleDefinition;
  adSetId: string;
  facts: FactMap;
  deduped: boolean;
};

/**
 * Evaluate every enabled rule against every eligible ad set.
 * Global gates (applied before any rule, not per-rule conditions):
 *   - frozen / flagged ad sets are skipped entirely
 *   - min-data filter: zero d14 spend AND zero d14 impressions => skipped
 *     (the DCO's skip-zero-data-targets filter)
 * Gated ad sets produce no evaluations at all.
 */
export function evaluateRules(
  snapshots: AdSetSnapshot[],
  rules: RuleDefinition[],
  cfg: EngineConfig,
  alreadyFlagged: AlreadyFlagged = new Map(),
): RuleEngineOutput {
  const active = rules.filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

  const portfolioFacts = buildPortfolioFacts(snapshots, cfg);
  const evaluations: RuleEvaluation[] = [];
  const matchesByAdset = new Map<string, Match[]>();

  for (const s of snapshots) {
    if (s.status === 'frozen' || s.status === 'flagged') continue;
    if (s.windows.d14.spend === 0 && (s.windows.d14.impressions ?? 0) === 0) continue;

    const adsetFacts = buildAdsetFacts(s, portfolioFacts, cfg);

    for (const rule of active) {
      const facts: FactMap = { ...adsetFacts, ...rule.params };
      try {
        if (evalCondition(rule.conditions, facts)) {
          const list = matchesByAdset.get(s.id) ?? [];
          list.push({ rule, adSetId: s.id, facts, deduped: false });
          matchesByAdset.set(s.id, list);
        } else {
          evaluations.push({
            ruleId: rule.id,
            templateId: rule.templateId,
            adSetId: s.id,
            matched: false,
          });
        }
      } catch (err) {
        evaluations.push({
          ruleId: rule.id,
          templateId: rule.templateId,
          adSetId: s.id,
          matched: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // --- Dedup + precedence ---------------------------------------------------
  const findings: RuleFinding[] = [];
  const starveIds = new Set<string>();
  const freezeIds = new Set<string>();

  for (const [adSetId, matches] of matchesByAdset) {
    const flagged: Set<RuleActionKind> = alreadyFlagged.get(adSetId) ?? new Set();

    // Highest-priority match wins per action kind (matches arrive pre-sorted).
    const winnerByKind = new Map<RuleActionKind, Match>();
    for (const m of matches) {
      const kind = m.rule.action.kind;
      if (!winnerByKind.has(kind)) winnerByKind.set(kind, m);
      else m.deduped = true;
    }

    // Built-ins win: a kind the native triggers already flagged is suppressed.
    for (const [kind, winner] of winnerByKind) {
      if (flagged.has(kind)) {
        winner.deduped = true;
        winnerByKind.delete(kind);
      }
    }

    // Pause/starve (built-in or winning rule) suppresses fatigue-kind findings
    // on the same ad set — mirrors evaluateFatigue's skipIds.
    const pauseOrStarve =
      flagged.has('pause') ||
      flagged.has('starve') ||
      winnerByKind.has('pause') ||
      winnerByKind.has('starve');
    if (pauseOrStarve) {
      for (const kind of FATIGUE_KINDS) {
        const winner = winnerByKind.get(kind);
        if (winner) {
          winner.deduped = true;
          winnerByKind.delete(kind);
        }
      }
    }

    for (const [kind, winner] of winnerByKind) {
      const { rule, facts } = winner;
      if (kind === 'starve') {
        starveIds.add(adSetId);
      } else if (kind === 'freeze') {
        freezeIds.add(adSetId);
      } else if (isFindingKind(kind)) {
        findings.push({
          adSetId,
          kind,
          trigger: `rule:${rule.templateId ?? rule.id}`,
          severity: rule.action.severity,
          reason: interpolateReason(rule.action.reasonTemplate, facts),
          needsApproval: true,
          ruleId: rule.id,
          templateId: rule.templateId,
        });
        // A pause finding starves the ad set, exactly like the built-in triggers.
        if (kind === 'pause') starveIds.add(adSetId);
      }
    }

    for (const m of matches) {
      evaluations.push({
        ruleId: m.rule.id,
        templateId: m.rule.templateId,
        adSetId,
        matched: true,
        deduped: m.deduped || undefined,
        facts: m.facts,
      });
    }
  }

  return { findings, starveIds, freezeIds, evaluations };
}
