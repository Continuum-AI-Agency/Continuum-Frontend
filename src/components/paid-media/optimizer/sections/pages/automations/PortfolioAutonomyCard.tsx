'use client';

// One portfolio on the Automations page (G14): its autonomy dial, what blocks a level and why, the
// scopes autopilot may approve on its own, the caps it writes inside, and its kill switch.
//
// Every control writes through the same mutations the portfolio's Manage section uses
// (optimizer_update_portfolio for the apply mode and the scopes, optimizer_set_autopilot_paused
// for Stop), so the two screens cannot disagree about a setting. A write shows as pending until
// the database answers; a refusal says so on the card and leaves the dial where it was. Turning
// autopilot on asks first, because from then on Continuum writes real budgets without a person.

import {
  type ApplyMode,
  type AutopilotScope,
  type AutopilotScopes,
  DEFAULT_AUTOPILOT_SCOPES,
  type PortfolioListItem,
} from '@continuum/contracts';
import { Loader2Icon, LockIcon, PauseIcon, PlayIcon, ShieldIcon } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApplyModePill } from '../../../ApplyModePill';
import { humanize } from '../../../format';
import { AutopilotScopesField } from '../../AutopilotScopesField';
import { PlatformChips } from '../../platforms/PlatformChip';
import { PLATFORM_NAMES } from '../../platforms/platformTabsModel';
import { AutonomyDial } from './AutonomyDial';
import {
  type AutonomyLevel,
  autonomyErrorText,
  LEVEL_APPLY_MODE,
  LEVEL_COPY,
  readAutonomy,
  showsScope,
} from './autonomyModel';

export type PortfolioAutonomyCardProps = {
  portfolio: PortfolioListItem;
  /** "3 waiting on a decision" — the page's line for what waits on a person here. */
  waiting: string;
  onManage: () => void;
  /** Writes the apply mode a level is stored as. */
  onSetLevel: (level: AutonomyLevel) => Promise<unknown>;
  onSetScope: (scope: AutopilotScope, enabled: boolean) => Promise<unknown>;
  onSetStopped: (stopped: boolean) => Promise<unknown>;
};

type Pending = { kind: 'level'; level: AutonomyLevel } | { kind: 'stop' } | null;

/** A confirmed write, and the list row (apply mode | stopped) it was written over. */
type Written = { row: string; applyMode?: ApplyMode; paused?: boolean };

/** The scopes the database confirmed, and the stored scopes they were written over. */
type WrittenScopes = { row: string; values: Partial<AutopilotScopes> };

export function PortfolioAutonomyCard({
  portfolio,
  waiting,
  onManage,
  onSetLevel,
  onSetScope,
  onSetStopped,
}: PortfolioAutonomyCardProps) {
  // What the database confirmed, held until the list read catches up with it: only an answered
  // write lands here, so a pending or refused one never moves the dial. It is tied to the row it
  // was written over, and any newer row from the list read is the truth again.
  const row = `${portfolio.apply_mode}|${portfolio.autopilot_paused === true}`;
  const [written, setWritten] = useState<Written | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [savingScope, setSavingScope] = useState<AutopilotScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arming, setArming] = useState(false);

  const scopesRow = JSON.stringify(portfolio.autopilot_scopes ?? null);
  const [writtenScopes, setWrittenScopes] = useState<WrittenScopes | null>(null);
  const confirmedScopes = writtenScopes?.row === scopesRow ? writtenScopes.values : null;
  const scopes = confirmedScopes
    ? { ...(portfolio.autopilot_scopes ?? DEFAULT_AUTOPILOT_SCOPES), ...confirmedScopes }
    : (portfolio.autopilot_scopes ?? null);

  const confirmed = written?.row === row ? written : null;
  const shown: PortfolioListItem = {
    ...portfolio,
    apply_mode: confirmed?.applyMode ?? portfolio.apply_mode,
    autopilot_paused: confirmed?.paused ?? portfolio.autopilot_paused,
  };
  const read = readAutonomy(shown);
  const busy = pending !== null || savingScope !== null;

  const writeLevel = (level: AutonomyLevel) => {
    const over = row;
    setError(null);
    setPending({ kind: 'level', level });
    onSetLevel(level)
      .then(() =>
        setWritten((prev) => ({
          ...(prev?.row === over ? prev : {}),
          row: over,
          applyMode: LEVEL_APPLY_MODE[level],
        })),
      )
      .catch((failure: unknown) => setError(autonomyErrorText(failure, level)))
      .finally(() => setPending(null));
  };

  const select = (level: AutonomyLevel) => {
    if (level === 'autopilot') {
      setArming(true);
      return;
    }
    writeLevel(level);
  };

  const toggleStopped = () => {
    const next = !read.stopped;
    const over = row;
    setError(null);
    setPending({ kind: 'stop' });
    onSetStopped(next)
      .then(() =>
        setWritten((prev) => ({ ...(prev?.row === over ? prev : {}), row: over, paused: next })),
      )
      .catch((failure: unknown) => setError(autonomyErrorText(failure, null)))
      .finally(() => setPending(null));
  };

  const setScope = (scope: AutopilotScope, enabled: boolean) => {
    const over = scopesRow;
    setError(null);
    setSavingScope(scope);
    const saving = onSetScope(scope, enabled);
    saving
      .then(() =>
        setWrittenScopes((prev) => ({
          row: over,
          values: { ...(prev?.row === over ? prev.values : {}), [scope]: enabled },
        })),
      )
      .catch((failure: unknown) => {
        // A key the database does not take yet is the field's own message; any other refusal
        // is the card's.
        if ((failure as { code?: unknown } | null)?.code !== '23514') {
          setError(autonomyErrorText(failure, null));
        }
      })
      .finally(() => setSavingScope(null));
    return saving;
  };

  const capsLabel = read.caps
    .filter((cap) => !cap.missing && cap.key !== 'paused')
    .map((cap) => cap.label)
    .join(' · ');
  const writesTo = read.writable.map((platform) => PLATFORM_NAMES[platform]).join(' and ');

  return (
    <li
      className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
      data-level={read.level}
      data-portfolio={portfolio.id}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-full sm:basis-40">
          <p className="truncate font-medium text-foreground text-sm">{portfolio.name}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            {humanize(portfolio.objective)}
            <PlatformChips platforms={read.platforms} />
          </p>
        </div>
        <ApplyModePill
          applyMode={shown.apply_mode}
          autopilotPaused={shown.autopilot_paused}
          scopes={scopes}
        />
        <span className="text-muted-foreground text-xs tabular-nums">{waiting}</span>
        <Button
          className="ml-auto h-7 px-2 text-xs"
          onClick={onManage}
          size="sm"
          type="button"
          variant="ghost"
        >
          Manage
        </Button>
      </div>

      <div className="space-y-1.5">
        <AutonomyDial
          disabled={busy}
          locks={read.locks}
          onSelect={select}
          pending={pending?.kind === 'level' ? pending.level : null}
          portfolioId={portfolio.id}
          value={read.level}
        />
        <p className="text-muted-foreground text-xs" data-testid="autonomy-level-hint">
          {LEVEL_COPY[read.level].hint}
        </p>
        {read.blockers.map((blocker) => (
          <p
            className="flex items-start gap-1.5 text-muted-foreground text-xs"
            data-lock={blocker.level}
            data-testid="autonomy-lock"
            key={blocker.level}
          >
            <LockIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            <span>
              <span className="font-medium text-foreground">
                {LEVEL_COPY[blocker.level].label}:
              </span>{' '}
              {blocker.reason}
            </span>
          </p>
        ))}
        {read.notes.map((note) => (
          <p
            className="text-amber-700 text-xs dark:text-amber-300"
            data-testid="autonomy-note"
            key={note}
          >
            {note}
          </p>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="font-medium text-foreground text-xs">What autopilot may approve on its own</p>
        <AutopilotScopesField
          disabled={!read.scopesEditable || busy}
          noActor={
            read.level === 'autopilot' &&
            portfolio.apply_mode_changed_by === null &&
            portfolio.autopilot_scopes_changed_by === null
          }
          onChange={setScope}
          portfolioId={portfolio.id}
          savingScope={savingScope}
          scopes={scopes}
          shown={(scope) => showsScope(scope, read.platforms)}
          variant="chips"
        />
        {read.scopesEditable ? null : (
          <p className="text-muted-foreground text-xs" data-testid="autonomy-scopes-locked">
            These take effect on Autopilot.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="autonomy-caps">
        {read.caps.map((cap) => (
          <Badge
            className="tabular-nums"
            data-cap={cap.key}
            data-missing={cap.missing ? 'true' : undefined}
            key={cap.key}
            // A missing cap is a warning only where autopilot could be reached at all.
            variant={cap.missing ? (read.canWrite ? 'warning' : 'muted') : 'outline'}
          >
            <ShieldIcon aria-hidden="true" className="text-muted-foreground" />
            {cap.label}
          </Badge>
        ))}
        <button
          className="hit-area font-medium text-primary-ink text-xs underline-offset-4 hover:underline"
          onClick={onManage}
          type="button"
        >
          {read.capsReady ? 'Edit caps' : 'Set caps'}
        </button>
      </div>

      {read.level === 'autopilot' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-7 gap-1.5 text-xs"
            disabled={busy}
            onClick={toggleStopped}
            size="sm"
            type="button"
            variant={read.stopped ? 'default' : 'outline'}
          >
            {pending?.kind === 'stop' ? (
              <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
            ) : read.stopped ? (
              <PlayIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <PauseIcon aria-hidden="true" className="size-3.5" />
            )}
            {read.stopped ? 'Resume autopilot' : 'Stop autopilot'}
          </Button>
          <span className="text-muted-foreground text-xs">
            {read.stopped
              ? 'Ingest and scoring still run; nothing is written.'
              : 'Halts every autonomous write without leaving Autopilot.'}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-xs" data-testid="autonomy-error" role="alert">
          {error}
        </p>
      ) : null}

      <AlertDialog onOpenChange={(open) => setArming(open)} open={arming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on autopilot for “{portfolio.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Autopilot writes real budgets to {writesTo} on every cycle, without waiting for a
              person, inside its caps: {capsLabel}. Anything a scope creates is born paused. Stop
              halts every write without leaving Autopilot. To see the cycle it would run first,
              preview it in Manage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                setArming(false);
                onManage();
              }}
              type="button"
              variant="outline"
            >
              Preview in Manage
            </Button>
            <Button
              onClick={() => {
                setArming(false);
                writeLevel('autopilot');
              }}
              type="button"
            >
              Turn on autopilot
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
