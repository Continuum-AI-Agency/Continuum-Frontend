// How much one portfolio may do on its own, read off its list row — pure, so the dial, its locks
// and its caps say what the row says and nothing else.
//
// The dial has four levels, the Home's modes for one portfolio:
//   observe    — scores every cycle, changes nothing (apply_mode 'observe');
//   recommend  — proposes; someone applies it on the platform (apply_mode 'recommend', and
//                Continuum may not write any of the portfolio's platforms);
//   approve    — writes each change once a person approves it (apply_mode 'recommend', and
//                Continuum may write at least one of them);
//   autopilot  — writes on its own inside the caps (apply_mode 'autopilot').
// Recommend and Approve are one apply mode. Which of the two a portfolio sits on is whether its
// platforms take writes (platform_writes — Meta unless switched off, any other platform only when
// switched on), so the dial never offers the one of the pair the row cannot be.

import type {
  ApplyMode,
  AutopilotScope,
  PortfolioListItem,
  UpdatePortfolioPatch,
} from '@continuum/contracts';
import { formatCurrency } from '../../../format';
import { platformWritable } from '../../../platformWrites';
import {
  type AdPlatform,
  PLATFORM_NAMES,
  portfolioPlatforms,
} from '../../platforms/platformTabsModel';
import { toInput } from '../../portfolioFields';
import { staleLine } from '../../portfolioStaleness';

export type AutonomyLevel = 'observe' | 'recommend' | 'approve' | 'autopilot';

export const AUTONOMY_LEVELS = [
  'observe',
  'recommend',
  'approve',
  'autopilot',
] as const satisfies readonly AutonomyLevel[];

export const LEVEL_COPY: Record<AutonomyLevel, { label: string; hint: string }> = {
  observe: { label: 'Observe', hint: 'Scores every cycle and changes nothing.' },
  recommend: {
    label: 'Recommend',
    hint: 'Proposes each change; someone applies it on the platform.',
  },
  approve: { label: 'Approve', hint: 'Writes each change once a person approves it.' },
  autopilot: { label: 'Autopilot', hint: 'Writes on its own, inside the caps.' },
};

/** The apply mode each level is stored as. */
export const LEVEL_APPLY_MODE: Record<AutonomyLevel, ApplyMode> = {
  observe: 'observe',
  recommend: 'recommend',
  approve: 'recommend',
  autopilot: 'autopilot',
};

/** The one write a level needs: its apply mode. */
export function patchForLevel(level: AutonomyLevel): UpdatePortfolioPatch {
  return { apply_mode: LEVEL_APPLY_MODE[level] };
}

/** Where the dial sits. An apply mode the contract does not know reads as Recommend, the mode
 *  the database defaults to. */
export function levelOf(applyMode: string | null | undefined, canWrite: boolean): AutonomyLevel {
  const mode = (applyMode ?? '').toLowerCase();
  if (mode === 'observe') return 'observe';
  if (mode === 'autopilot') return 'autopilot';
  return canWrite ? 'approve' : 'recommend';
}

/** A cap autopilot writes inside, as a chip says it. `missing` is a cap autopilot needs and the
 *  portfolio does not have. */
export type AutonomyCap = { key: string; label: string; missing?: boolean };

export type AutonomyRead = {
  level: AutonomyLevel;
  /** Why a level cannot be chosen from here. The level the portfolio is on is never locked. */
  locks: Partial<Record<AutonomyLevel, string>>;
  /** What stands between the portfolio and more autonomy: the locks above its level, each reason
   *  once. Recommend while writes are on is no blocker — Approve, above it, is open. */
  blockers: { level: AutonomyLevel; reason: string }[];
  /** What a person should know about the level it is on: stopped, nothing to move, writes off. */
  notes: string[];
  platforms: AdPlatform[];
  /** The platforms Continuum may write here. */
  writable: AdPlatform[];
  canWrite: boolean;
  /** Autopilot halted by its kill switch, without leaving the mode. */
  stopped: boolean;
  caps: AutonomyCap[];
  /** Both caps the database requires before it stores autopilot. */
  capsReady: boolean;
  /** Scopes are what autopilot may approve on its own: they only take effect on autopilot. */
  scopesEditable: boolean;
};

type AutonomySource = Pick<
  PortfolioListItem,
  | 'apply_mode'
  | 'autopilot_paused'
  | 'platforms'
  | 'platform_writes'
  | 'max_change_pct_per_cycle'
  | 'max_daily_apply_minor'
  | 'velocity_cap_pct'
  | 'currency'
  | 'last_cycle_current'
  | 'withdrawn_reason'
  | 'stale_for_days'
  | 'last_actual_cycle_at'
>;

const names = (platforms: readonly AdPlatform[]) =>
  platforms.map((platform) => PLATFORM_NAMES[platform]).join(' and ');

const UNIT = (currency: string | null | undefined) => ({ currency, denominatorMultiplier: 1 });

/** A stored fraction (0.2) as the percent an operator typed (20), through the form's own unit. */
function percentOf(
  key: 'max_change_pct_per_cycle' | 'velocity_cap_pct',
  stored: number | null | undefined,
): number | null {
  if (stored == null || !(stored > 0)) return null;
  const typed = Number(toInput(key, stored, UNIT(null)));
  return Number.isFinite(typed) ? typed : null;
}

/** The daily ceiling in the account's major units, through the form's own unit. */
function dailyCapOf(stored: number | null | undefined, currency: string | null | undefined) {
  if (stored == null || !(stored > 0)) return null;
  const major = Number(toInput('max_daily_apply_minor', stored, UNIT(currency)));
  return Number.isFinite(major) ? major : null;
}

/** The caps autopilot writes inside, the two it needs first. */
export function autonomyCaps(portfolio: AutonomySource): AutonomyCap[] {
  const perCycle = percentOf('max_change_pct_per_cycle', portfolio.max_change_pct_per_cycle);
  const daily = dailyCapOf(portfolio.max_daily_apply_minor, portfolio.currency);
  const perAdset = percentOf('velocity_cap_pct', portfolio.velocity_cap_pct);
  const caps: AutonomyCap[] = [
    perCycle == null
      ? { key: 'per-cycle', label: 'No max change per cycle', missing: true }
      : { key: 'per-cycle', label: `Max ${perCycle}% per cycle` },
    daily == null
      ? { key: 'daily', label: 'No daily cap', missing: true }
      : { key: 'daily', label: `Max ${formatCurrency(daily, portfolio.currency)}/day` },
  ];
  if (perAdset != null) caps.push({ key: 'per-adset', label: `Max ${perAdset}% per ad set` });
  caps.push({ key: 'paused', label: 'New objects created PAUSED' });
  return caps;
}

const WITHDRAWN_WORDS: Record<'roster_absent' | 'no_members', string> = {
  roster_absent: 'its whole roster has left the ad account',
  no_members: 'nothing is enrolled any more',
};

/** A portfolio whose latest cycle no longer stands because it has nothing left to manage. A
 *  missed cycle alone withdraws its moves but leaves its roster, so it locks nothing. */
function withdrawnWords(portfolio: AutonomySource): string | null {
  if (portfolio.last_cycle_current !== false) return null;
  const reason = portfolio.withdrawn_reason;
  return reason === 'roster_absent' || reason === 'no_members' ? WITHDRAWN_WORDS[reason] : null;
}

export function readAutonomy(portfolio: AutonomySource): AutonomyRead {
  const platforms = portfolioPlatforms(portfolio.platforms);
  const writable = platforms.filter((platform) => platformWritable(portfolio, platform));
  const blocked = platforms.filter((platform) => !platformWritable(portfolio, platform));
  const canWrite = writable.length > 0;
  const level = levelOf(portfolio.apply_mode, canWrite);
  const caps = autonomyCaps(portfolio);
  const capsReady = caps.every((cap) => !cap.missing);
  const withdrawn = withdrawnWords(portfolio);
  const stopped = level === 'autopilot' && portfolio.autopilot_paused === true;

  // The first reason that blocks a level is the one it gives; the level it is on is never locked.
  const locks: Partial<Record<AutonomyLevel, string>> = {};
  const lock = (target: AutonomyLevel, reason: string | null) => {
    if (reason && target !== level && !locks[target]) locks[target] = reason;
  };
  if (canWrite) {
    lock(
      'recommend',
      `Continuum may write ${names(writable)} here, so a change you approve is written: that is Approve. Observe writes nothing.`,
    );
  } else {
    const off = `Writes to ${names(blocked)} are switched off for this portfolio, so Continuum only recommends.`;
    lock('approve', off);
    lock('autopilot', off);
  }
  lock('autopilot', withdrawn ? `Withdrawn: ${withdrawn}.` : null);
  lock(
    'autopilot',
    capsReady
      ? null
      : 'Needs both caps first: a max change per cycle and a daily cap. Set them in Manage.',
  );

  const at = AUTONOMY_LEVELS.indexOf(level);
  const blockers = AUTONOMY_LEVELS.flatMap((target, index) => {
    const reason = locks[target];
    if (!reason || index <= at || (target === 'recommend' && canWrite)) return [];
    return [{ level: target, reason }];
  }).filter((blocker, index, all) => all.findIndex((b) => b.reason === blocker.reason) === index);

  const notes: string[] = [];
  if (stopped) notes.push('Stopped by a person: no autonomous write until it is resumed.');
  if (level === 'autopilot' && withdrawn)
    notes.push(`Autopilot has nothing to move: ${withdrawn}.`);
  if (level === 'autopilot' && !canWrite) {
    notes.push(`Autopilot writes nothing here: writes to ${names(blocked)} are switched off.`);
  }
  if (canWrite && blocked.length > 0 && level !== 'observe') {
    notes.push(`Writes to ${names(blocked)} are switched off here: its changes stay proposals.`);
  }
  const stale = staleLine(portfolio);
  if (stale) notes.push(`Stale: ${stale}.`);

  return {
    level,
    locks,
    blockers,
    notes,
    platforms,
    writable,
    canWrite,
    stopped,
    caps,
    capsReady,
    scopesEditable: level === 'autopilot',
  };
}

/** How many portfolios sit on each level: the page's distribution of autonomy. */
export function levelCounts(portfolios: readonly AutonomySource[]): Record<AutonomyLevel, number> {
  const counts: Record<AutonomyLevel, number> = {
    observe: 0,
    recommend: 0,
    approve: 0,
    autopilot: 0,
  };
  for (const portfolio of portfolios) counts[readAutonomy(portfolio).level] += 1;
  return counts;
}

/** Whether a scope only matters across platforms: a move between them needs two. */
export function showsScope(scope: AutopilotScope, platforms: readonly AdPlatform[]): boolean {
  return scope !== 'budget_move' || platforms.length > 1;
}

const CHECK_VIOLATION = '23514';

/** What a refused write says on the card. The database refuses autopilot without both caps
 *  (optimizer_portfolios_autopilot_guardrails_chk); every other refusal keeps its own words. */
export function autonomyErrorText(error: unknown, level: AutonomyLevel | null): string {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null;
  if (level === 'autopilot' && code === CHECK_VIOLATION) {
    return 'The database refused autopilot: it needs both caps above 0. Nothing was changed.';
  }
  const message = error instanceof Error && error.message ? error.message : 'The write failed.';
  return `${message} Nothing was changed.`;
}
